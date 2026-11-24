import { getDynamoDb, getS3 } from "./clients.js";
import { consumeColdStart } from "./cold-start.js";
import { startTimer } from "./timing.js";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";



const initMs = Math.round(performance.now());

export const handler = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
    const coldStart = consumeColdStart();
    const elapsed = startTimer();
    
    const path = event.rawPath ?? "/";

    if (path === "/receipt") await getS3()
    else if (path === "/order") await getDynamoDb()

    const body = { status: "ok", path };
    console.log(
        JSON.stringify({
            msg: "request_done",
            coldStart,
            initMs: coldStart ? initMs : 0,
            handlerMs: elapsed(),
        }),
    );
    return { statusCode: 200, body: JSON.stringify(body) };
};
