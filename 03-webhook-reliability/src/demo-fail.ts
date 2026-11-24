import { createHmac } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";

const config = {
  region: "me-central-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};
const lambda = new LambdaClient(config);
const db = new DynamoDBClient(config);
const sqs = new SQSClient(config);

const secret = process.env.WEBHOOK_SECRET ?? "whsec_demo";
const eventId = `evt_${Date.now()}`;
const orderId = `fail_${Date.now()}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function depth(queue: string): Promise<{ visible: number; inFlight: number }> {
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl,
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    }),
  );
  return {
    visible: Number(Attributes?.ApproximateNumberOfMessages ?? 0),
    inFlight: Number(Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0),
  };
}

await db.send(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: orderId }, status: { S: "pending" }, amount: { N: "4999" } },
  }),
);

const body = JSON.stringify({ eventId, orderId, type: "payment.succeeded" });
const signature = createHmac("sha256", secret).update(body).digest("hex");
const res = await lambda.send(
  new InvokeCommand({
    FunctionName: "webhook-fn",
    Payload: new TextEncoder().encode(
      JSON.stringify({ body, isBase64Encoded: false, headers: { "x-signature": signature } }),
    ),
  }),
);
const reply = JSON.parse(new TextDecoder().decode(res.Payload));
console.log(`Webhook for ${orderId} accepted: ${reply.statusCode}`);
console.log("Worker will fail 3 times (30 s visibility timeout each), then SQS moves it to the DLQ.\n");

const started = Date.now();
for (let i = 0; i < 30; i += 1) {
  await sleep(5000);
  const main = await depth("payments");
  const dlq = await depth("payments-dlq");
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`${String(secs).padStart(3)} s  payments: ${main.visible} waiting, ${main.inFlight} in flight  |  payments-dlq: ${dlq.visible}`);
  if (dlq.visible >= 1) {
    console.log(`\nPASS: ${orderId} is parked in payments-dlq, not lost and not blocking other orders.`);
    process.exit(0);
  }
}
console.log("\nCHECK: message did not reach the DLQ in 150 s.");
process.exit(1);
