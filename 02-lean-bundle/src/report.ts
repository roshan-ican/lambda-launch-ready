import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { summarize, type RequestLog } from "./stats.js";

const fn = process.argv[2] ?? "lean-bundle";

const logs = new CloudWatchLogsClient({
  region: "me-central-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const messages: string[] = [];
let nextToken: string | undefined;
do {
  const page = await logs.send(
    new FilterLogEventsCommand({ logGroupName: `/aws/lambda/${fn}`, nextToken }),
  );
  for (const event of page.events ?? []) messages.push(event.message ?? "");
  nextToken = page.nextToken;
} while (nextToken);

const requests: RequestLog[] = messages.flatMap((line) => {
  if (!line.includes("request_done")) return [];
  try {
    return [JSON.parse(line.slice(line.indexOf("{"))) as RequestLog];
  } catch {
    return [];
  }
});

const lambdaInit = messages.flatMap((line) => {
  const match = /Init Duration: ([\d.]+) ms/.exec(line);
  return match?.[1] ? [Number(match[1])] : [];
});

const s = summarize(requests);
console.table({
  requests: s.requests,
  coldStarts: s.coldStarts,
  coldStartRate: `${(s.coldStartRate * 100).toFixed(1)}%`,
  p50Ms: s.p50,
  p95Ms: s.p95,
  p99Ms: s.p99,
  worstColdMs: s.worstColdMs,
  lambdaInitMaxMs: lambdaInit.length ? Math.max(...lambdaInit) : "n/a",
});
