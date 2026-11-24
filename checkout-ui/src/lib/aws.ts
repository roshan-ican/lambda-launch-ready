// Server-only: AWS SDK clients pointed at LocalStack.
// Only route handlers import this file, so none of it reaches the browser.
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SQSClient } from "@aws-sdk/client-sqs";

// Same region as 03-webhook-reliability/src/config.ts (LocalStack Function URLs
// don't route me-* regions; on real AWS this would be me-central-1).
const config = {
  region: process.env.AWS_REGION_LOCAL ?? "eu-central-1",
  endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

export const db = new DynamoDBClient(config);
export const sqs = new SQSClient(config);
export const lambda = new LambdaClient(config);
export const cloudwatch = new CloudWatchClient(config);
export const logs = new CloudWatchLogsClient(config);

export const ORDERS_TABLE = "orders";
export const WORKER_FN = "worker-fn";
export const FUNCTIONS = ["create-order-fn", "webhook-fn", "worker-fn"] as const;
export const ALARM = "payments-dlq-not-empty";

export function env(name: "ORDER_URL" | "WEBHOOK_URL" | "WEBHOOK_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing: run npm run deploy in 03-webhook-reliability`);
  return value;
}
