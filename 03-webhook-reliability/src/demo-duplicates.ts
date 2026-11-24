import { createHmac } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { LOCAL } from "./config.js";

const config = LOCAL;
const lambda = new LambdaClient(config);
const db = new DynamoDBClient(config);
const logs = new CloudWatchLogsClient(config);

const secret = process.env.WEBHOOK_SECRET ?? "whsec_demo";
const copies = Number(process.argv[2] ?? 5);
const eventId = `evt_${Date.now()}`;
const orderId = `ord_${Date.now()}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function orderStatus(): Promise<string> {
  const res = await db.send(new GetItemCommand({ TableName: "orders", Key: { orderId: { S: orderId } } }));
  return res.Item?.status?.S ?? "missing";
}

async function workerLines(since: number): Promise<string[]> {
  try {
    const res = await logs.send(
      new FilterLogEventsCommand({ logGroupName: "/aws/lambda/worker-fn", startTime: since }),
    );
    return (res.events ?? []).map((e) => e.message ?? "");
  } catch {
    return [];
  }
}

await db.send(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: orderId }, status: { S: "pending" }, amount: { N: "4999" } },
  }),
);
console.log(`Order ${orderId} created, status: ${await orderStatus()}`);

const body = JSON.stringify({ eventId, orderId, type: "payment.succeeded" });
const signature = createHmac("sha256", secret).update(body).digest("hex");
const since = Date.now() - 1000;

console.log(`\nPayment provider sends webhook ${eventId} ${copies} times (retries)...`);
const replies = await Promise.all(
  Array.from({ length: copies }, async () => {
    const res = await lambda.send(
      new InvokeCommand({
        FunctionName: "webhook-fn",
        Payload: new TextEncoder().encode(
          JSON.stringify({ body, isBase64Encoded: false, headers: { "x-signature": signature } }),
        ),
      }),
    );
    const reply = JSON.parse(new TextDecoder().decode(res.Payload));
    return reply.statusCode as number;
  }),
);
console.log(`Webhook Lambda replied: ${replies.join(", ")}`);

console.log("\nWaiting for the worker to drain the queue...");
let processed = 0;
let duplicates = 0;
for (let i = 0; i < 40; i += 1) {
  await sleep(1000);
  const lines = await workerLines(since);
  processed = lines.filter((l) => l.includes("event_processed") && l.includes(eventId)).length;
  duplicates = lines.filter((l) => l.includes("event_duplicate")).length;
  if (processed + duplicates >= copies) break;
}

console.log(`\nWorker processed ${eventId}: ${processed} time(s)`);
console.log(`Worker skipped as duplicate: ${duplicates}`);
console.log(`Order ${orderId} status now: ${await orderStatus()}`);
console.log(processed === 1 ? "\nPASS: same webhook sent many times, processed once." : "\nCHECK: expected exactly 1 processed.");
