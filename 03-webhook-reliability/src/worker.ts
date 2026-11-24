import {
    DynamoDBClient,
    TransactWriteItemsCommand,
    TransactionCanceledException
} from "@aws-sdk/client-dynamodb";

import type {
    SQSEvent,
    SQSBatchResponse
} from "aws-lambda";
import { REGION } from "./config.js";

const db = new DynamoDBClient({ region: REGION })

function isDuplicate(error: unknown): boolean {
    if (error instanceof TransactionCanceledException && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
        return true
    }
    return false
}

// For logs only: read eventId/orderId from a body that may be broken.
function idsOf(body: string): { eventId?: string; orderId?: string } {
    try {
        const { eventId, orderId } = JSON.parse(body)
        return { eventId, orderId }
    } catch {
        return {}
    }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
    const failures: { itemIdentifier: string }[] = []
    for (const record of event.Records) {
        try {
            const { eventId, orderId } = JSON.parse(record.body)

            if (process.env.SIMULATE_BUG === "true" && orderId.startsWith("fail_")) {
                throw new Error(`simulated bug for ${orderId}`)
            }
            await db.send(new TransactWriteItemsCommand({
                TransactItems: [
                    {
                        Put: {
                            TableName: process.env.EVENTS_TABLE,
                            Item: { eventId: { S: eventId } },
                            ConditionExpression: "attribute_not_exists(eventId)"
                        },
                    },
                    {
                        Update: {
                            TableName: process.env.ORDERS_TABLE,
                            Key: { orderId: { S: orderId } },
                            UpdateExpression: "SET #s = :paid",
                            ExpressionAttributeNames: { "#s": "status" },
                            ExpressionAttributeValues: { ":paid": { S: "paid" } }
                        }
                    }
                ]
            }))
            console.log(JSON.stringify({ msg: "event_processed", eventId, orderId }))
        } catch (error) {
            if (isDuplicate(error)) {
                console.log(JSON.stringify({ msg: "event_duplicate", messageId: record.messageId, ...idsOf(record.body) }))
            } else {
                console.log(JSON.stringify({
                    msg: "event_failed",
                    messageId: record.messageId,
                    receiveCount: Number(record.attributes?.ApproximateReceiveCount ?? 1),
                    reason: error instanceof Error ? error.message : String(error),
                    ...idsOf(record.body)
                }))
                failures.push({ itemIdentifier: record.messageId })
            }
        }
    }
    return { batchItemFailures: failures }
}
