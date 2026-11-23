import { consumeColdStart } from "./cold-start.js";
import { startTimer } from "./timing.js";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda"

const initMs = Math.round(performance.now())

export const handler = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
    const coldStart = consumeColdStart();
    const elapsed = startTimer()


    const body = { status: "ok", path: event.rawPath ?? "/" }
    console.log(
        JSON.stringify({
            msg: "request_done",
            coldStart,
            initMs: coldStart ? initMs : 0,
            handlerMs: elapsed(),
        })
    )
    return { statusCode: 200, body: JSON.stringify(body) }
}