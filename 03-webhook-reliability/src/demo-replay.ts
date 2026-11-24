import {
  LambdaClient,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { replay } from "./replay.js";
import { LOCAL } from "./config.js";

const config = LOCAL;
const lambda = new LambdaClient(config);
const db = new DynamoDBClient(config);
const sqs = new SQSClient(config);
const cw = new CloudWatchClient(config);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const url = async (name: string) =>
  (await sqs.send(new GetQueueUrlCommand({ QueueName: name }))).QueueUrl ?? "";

async function dlqCount(dlqUrl: string): Promise<number> {
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ["ApproximateNumberOfMessages"] }),
  );
  return Number(Attributes?.ApproximateNumberOfMessages ?? 0);
}

async function failOrders(): Promise<{ orderId: string; status: string }[]> {
  const res = await db.send(
    new ScanCommand({
      TableName: "orders",
      FilterExpression: "begins_with(orderId, :p)",
      ExpressionAttributeValues: { ":p": { S: "fail_" } },
    }),
  );
  return (res.Items ?? []).map((i) => ({ orderId: i.orderId?.S ?? "", status: i.status?.S ?? "" }));
}

async function alarmState(): Promise<string> {
  const res = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["payments-dlq-not-empty"] }));
  return res.MetricAlarms?.[0]?.StateValue ?? "missing";
}

const dlqUrl = await url("payments-dlq");
const mainUrl = await url("payments");

console.log("BEFORE");
console.log(`  payments-dlq: ${await dlqCount(dlqUrl)} message(s)   alarm: ${await alarmState()}`);
for (const o of await failOrders()) console.log(`  ${o.orderId}: ${o.status}`);

console.log("\n1. Ship the fix: worker SIMULATE_BUG=false");
await lambda.send(
  new UpdateFunctionConfigurationCommand({
    FunctionName: "worker-fn",
    Environment: {
      Variables: { EVENTS_TABLE: "processed-events", ORDERS_TABLE: "orders", SIMULATE_BUG: "false" },
    },
  }),
);
await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: "worker-fn" });

console.log("2. Replay the DLQ back to payments");
const moved = await replay(sqs, dlqUrl, mainUrl);
console.log(`   moved ${moved} message(s)`);

console.log("3. Waiting for the worker to mark the orders paid...");
for (let i = 0; i < 30; i += 1) {
  await sleep(2000);
  const orders = await failOrders();
  if (orders.length > 0 && orders.every((o) => o.status === "paid")) break;
}

console.log("4. Waiting for the alarm to go back to OK (CloudWatch checks every 60 s)...");
let state = await alarmState();
for (let i = 0; i < 18 && state !== "OK"; i += 1) {
  await sleep(5000);
  state = await alarmState();
}

console.log("\nAFTER");
console.log(`  payments-dlq: ${await dlqCount(dlqUrl)} message(s)   alarm: ${state}`);
const orders = await failOrders();
for (const o of orders) console.log(`  ${o.orderId}: ${o.status}`);

const ok = orders.length > 0 && orders.every((o) => o.status === "paid") && (await dlqCount(dlqUrl)) === 0;
console.log(ok ? "\nPASS: bug fixed, DLQ replayed, every payment applied. Nothing lost." : "\nCHECK: something is still pending.");
process.exit(ok ? 0 : 1);
