import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { db, ORDERS_TABLE } from "@/lib/aws";
import { sendWebhook } from "@/lib/provider";

// Test hook: an order whose id starts with fail_ trips the worker's simulated bug
// (only while SIMULATE_BUG=true). create-order always makes ord_ ids, so the
// test order is written straight to the table, like demo-fail.ts does.
export async function POST() {
  const orderId = `fail_${Date.now()}`;
  await db.send(
    new PutItemCommand({
      TableName: ORDERS_TABLE,
      Item: {
        orderId: { S: orderId },
        status: { S: "pending" },
        amount: { N: "4999" },
        createdAt: { S: new Date().toISOString() },
      },
    }),
  );
  return Response.json(await sendWebhook(orderId, 1));
}
