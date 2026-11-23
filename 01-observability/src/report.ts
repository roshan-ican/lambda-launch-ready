import { execFileSync } from "node:child_process";
import { summarize, type RequestLog } from "./stats.js";

const fn = process.argv[2] ?? "obs-status";

const raw = execFileSync("aws", [
  "logs", "filter-log-events",
  "--log-group-name", `/aws/lambda/${fn}`,
  "--filter-pattern", "request_done",
  "--query", "events[].message",
  "--output", "json",
], {
  encoding: "utf8",
  env: {
    ...process.env,
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_DEFAULT_REGION: "me-central-1",
    AWS_ENDPOINT_URL: "http://localhost:4566",
    AWS_PAGER: "",
  },
});

const messages: string[] = JSON.parse(raw);
const logs: RequestLog[] = messages.flatMap((line) => {
  try {
    const parsed = JSON.parse(line.slice(line.indexOf("{")));
    return parsed.msg === "request_done" ? [parsed as RequestLog] : [];
  } catch {
    return [];
  }
});

const s = summarize(logs);
console.table({
  requests: s.requests,
  coldStarts: s.coldStarts,
  coldStartRate: `${(s.coldStartRate * 100).toFixed(1)}%`,
  p50Ms: s.p50,
  p95Ms: s.p95,
  p99Ms: s.p99,
  worstColdMs: s.worstColdMs,
});
