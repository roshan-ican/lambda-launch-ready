import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export function respond(statusCode: number, data: object): APIGatewayProxyResultV2 {
    return {
        statusCode,
        body: JSON.stringify(data)
    }
}

export function readBody(event: APIGatewayProxyEventV2): string {
    const raw = event.body ?? ""
    return event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf-8") : raw
}
