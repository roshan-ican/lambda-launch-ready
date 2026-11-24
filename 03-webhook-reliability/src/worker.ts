import {
    DynamoDBClient,
    TransactWriteItemsCommand,
    TransactionCanceledException
} from "@aws-sdk/client-dynamodb";

import type {
    SQSEvent,
    SQSBatchResponse
} from "aws-lambda";

const db = new DynamoDBClient({ region: "me-central-1" })

function isDuplicate(error: unknown): boolean {
    if (error instanceof TransactionCanceledException && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
        return true
    }
    return false
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
                console.log(JSON.stringify({ msg: "event_duplicate", messageId: record.messageId }))
            } else {
                failures.push({ itemIdentifier: record.messageId })
            }
        }
    }
    return { batchItemFailures: failures }
}
