

import { verifySignature } from "./signature.js";
import { respond, readBody } from "./http.js";
import { REGION } from "./config.js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const sqs = new SQSClient({ region: REGION })

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const rawBody = readBody(event)

    const signature = event.headers?.["x-signature"]
    const secret = process.env.WEBHOOK_SECRET ?? ""

    if (!verifySignature(rawBody, signature, secret)) {
        return respond(401, {
            error: "invalid signature"
        })
    }
    let parsed: { eventId?: unknown }
    try {
        parsed = JSON.parse(rawBody)
    } catch (error) {
        return respond(400, {
            error: "Body must be JSON"
        })
    }
    if (typeof parsed.eventId !== "string") {
        return respond(400, {
            error: "missing eventId"
        })
    }
    await sqs.send(
        new SendMessageCommand({
            QueueUrl: process.env.QUEUE_URL!,
            MessageBody: rawBody
        })
    )
    return respond(200, {

        received: true,
        eventId: parsed.eventId
    });
}