import { UpdateFunctionConfigurationCommand, waitUntilFunctionUpdatedV2 } from "@aws-sdk/client-lambda";
import { lambda, ORDERS_TABLE, WORKER_FN } from "@/lib/aws";

// "Ship the fix" (bug off) or bring the bug back (bug on) by changing one env var.
export async function POST(request: Request) {
  const { bug } = await request.json();
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: WORKER_FN,
      Environment: {
        Variables: { EVENTS_TABLE: "processed-events", ORDERS_TABLE, SIMULATE_BUG: bug ? "true" : "false" },
      },
    }),
  );
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: WORKER_FN });
  return Response.json({ bug: Boolean(bug) });
}
