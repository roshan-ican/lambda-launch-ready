import type { APIGatewayProxyResultV2, APIGatewayProxyEventV2 } from "aws-lambda";
import { respond, readBody } from "./http.js";
import { REGION } from "./config.js";
import { error } from "node:console";
import { randomUUID } from "node:crypto";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";


const db = new DynamoDBClient({ region: REGION })

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const rawBody = readBody(event)

    let parsed: { amount?: unknown }

    try {
        parsed = JSON.parse(rawBody)
    } catch {
        return respond(400, { error: "Body must be JSON" })
    }
    const amount = parsed.amount
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        return respond(400, { error: "amount must be positive whole number (in fils)" })
    }
    const orderId = `ord_${randomUUID()}`
    await db.send(new PutItemCommand({
        TableName: process.env.ORDERS_TABLE,
        Item: {
            orderId: { S: orderId },
            status: { S: "pending" },
            amount: { N: String(amount) },
            createdAt: { S: new Date().toISOString() }
        },
        ConditionExpression: "attribute_not_exists(orderId)"

    }))
    return respond(201, { orderId, status: "pending" })

}