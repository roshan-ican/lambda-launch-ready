import { DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ScanCommand } from "@aws-sdk/client-dynamodb";
import { GetFunctionConfigurationCommand } from "@aws-sdk/client-lambda";
import { GetQueueAttributesCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { ALARM, cloudwatch, db, FUNCTIONS, lambda, logs, ORDERS_TABLE, sqs, WORKER_FN } from "@/lib/aws";
import { eventStory, parseInvocations, summarize, type LogLine } from "@/lib/timeline";

// Everything the screen shows, in one poll. `since` = when this session started (ms).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const since = Number(params.get("since")) || Date.now() - 10 * 60_000;
  const mark = Number(params.get("mark")) || null; // start of the last action
  const eventId = params.get("event"); // the last action's eventId

  const [lines, orders, payments, dlq, alarm, bug] = await Promise.all([
    readLogs(since),
    recentOrders(since),
    depth("payments"),
    depth("payments-dlq"),
    alarmState(),
    bugState(),
  ]);

  const invocations = parseInvocations(lines);
  return Response.json({
    now: Date.now(),
    summary: summarize(invocations),
    sinceMark: mark ? summarize(invocations.filter((i) => i.at >= mark)) : null,
    event: eventId ? eventStory(invocations, eventId) : null,
    invocations: invocations.slice(0, 40),
    orders,
    queues: { payments, dlq },
    alarm,
    bug,
  });
}

async function readLogs(since: number): Promise<LogLine[]> {
  const perFn = await Promise.all(
    FUNCTIONS.map(async (fn) => {
      const out: LogLine[] = [];
      let nextToken: string | undefined;
      try {
        do {
          const res = await logs.send(
            new FilterLogEventsCommand({ logGroupName: `/aws/lambda/${fn}`, startTime: since, nextToken }),
          );
          for (const e of res.events ?? []) {
            out.push({ fn, timestamp: e.timestamp ?? 0, message: e.message ?? "" });
          }
          nextToken = res.nextToken;
        } while (nextToken && out.length < 5000);
      } catch {
        // log group not created yet (function never ran)
      }
      return out;
    }),
  );
  return perFn.flat();
}

async function recentOrders(since: number) {
  const res = await db.send(new ScanCommand({ TableName: ORDERS_TABLE }));
  const all = (res.Items ?? []).map((i) => ({
    orderId: i.orderId?.S ?? "",
    status: i.status?.S ?? "",
    amount: Number(i.amount?.N ?? 0),
    createdAt: i.createdAt?.S ?? null,
  }));
  const mine = all.filter((o) => o.createdAt && Date.parse(o.createdAt) >= since - 1000);
  mine.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return {
    rows: mine.slice(0, 6),
    total: mine.length,
    paid: mine.filter((o) => o.status === "paid").length,
    pending: mine.filter((o) => o.status === "pending").length,
  };
}

async function depth(queue: string) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
    const { Attributes } = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl,
        AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
      }),
    );
    return {
      waiting: Number(Attributes?.ApproximateNumberOfMessages ?? 0),
      inFlight: Number(Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0),
    };
  } catch {
    return null;
  }
}

async function alarmState(): Promise<string | null> {
  try {
    const res = await cloudwatch.send(new DescribeAlarmsCommand({ AlarmNames: [ALARM] }));
    return res.MetricAlarms?.[0]?.StateValue ?? null;
  } catch {
    return null;
  }
}

async function bugState(): Promise<boolean | null> {
  try {
    const res = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: WORKER_FN }));
    return res.Environment?.Variables?.SIMULATE_BUG === "true";
  } catch {
    return null;
  }
}
