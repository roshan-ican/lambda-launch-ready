import { describe, expect, it } from "vitest";
import { eventStory, parseInvocations, summarize, type LogLine } from "./timeline";

const A = "13b6cc51-98da-4099-8e30-c1bb7e06b6dc";
const B = "632f7dc4-7d22-49bc-86bd-cc6ed3959bff";

// Real line shapes copied from LocalStack's /aws/lambda/* log groups.
const lines: LogLine[] = [
  { fn: "worker-fn", timestamp: 1000, message: `START RequestId: ${A} Version: $LATEST\n` },
  {
    fn: "worker-fn",
    timestamp: 1010,
    message: `2026-11-24T18:00:45.081Z\t${A}\tINFO\t{"msg":"event_processed","eventId":"evt_1","orderId":"ord_1"}\n`,
  },
  {
    fn: "worker-fn",
    timestamp: 1011,
    message: `2026-11-24T18:00:45.082Z\t${A}\tINFO\t{"msg":"event_duplicate","messageId":"m2","eventId":"evt_1","orderId":"ord_1"}\n`,
  },
  {
    fn: "worker-fn",
    timestamp: 1020,
    message: `REPORT RequestId: ${A}\tDuration: 13.66 ms\tBilled Duration: 14 ms\tMemory Size: 256 MB\tMax Memory Used: 256 MB\tInit Duration: 66.47 ms\t\n`,
  },
  { fn: "webhook-fn", timestamp: 2000, message: `START RequestId: ${B} Version: $LATEST\n` },
  {
    fn: "webhook-fn",
    timestamp: 2001,
    message: `2026-11-24T18:00:44.339Z\t${B}\tWARN\tQueueUrl=http://sqs... differs from SQSClient resolved endpoint\n`,
  },
  {
    fn: "webhook-fn",
    timestamp: 2030,
    message: `REPORT RequestId: ${B}\tDuration: 35.58 ms\tBilled Duration: 36 ms\tMemory Size: 256 MB\tMax Memory Used: 256 MB\t\n`,
  },
];

describe("parseInvocations", () => {
  const inv = parseInvocations(lines);

  it("makes one row per request, newest first", () => {
    expect(inv.map((i) => i.fn)).toEqual(["webhook-fn", "worker-fn"]);
  });

  it("marks a REPORT with Init Duration as a cold start and rounds the ms", () => {
    const worker = inv.find((i) => i.fn === "worker-fn")!;
    expect(worker).toMatchObject({ cold: true, initMs: 66, durationMs: 14, at: 1000 });
  });

  it("marks a REPORT without Init Duration as warm", () => {
    expect(inv.find((i) => i.fn === "webhook-fn")).toMatchObject({ cold: false, initMs: null, durationMs: 36 });
  });

  it("collects our JSON outcome lines and ignores other log lines", () => {
    const worker = inv.find((i) => i.fn === "worker-fn")!;
    expect(worker.results.map((r) => r.outcome)).toEqual(["processed", "duplicate"]);
    expect(inv.find((i) => i.fn === "webhook-fn")!.results).toEqual([]);
  });
});

describe("summarize and eventStory", () => {
  const inv = parseInvocations(lines);

  it("counts calls, cold starts, the worst init and outcomes", () => {
    expect(summarize(inv)).toEqual({
      invocations: 2,
      cold: 1,
      worstInitMs: 66,
      webhooks: 1,
      coldByFn: { "worker-fn": 1 },
      processed: 1,
      duplicates: 1,
      failed: 0,
    });
  });

  it("reports an honest null worst init when nothing was cold", () => {
    expect(summarize([]).worstInitMs).toBeNull();
  });

  it("tells what happened to one event", () => {
    expect(eventStory(inv, "evt_1")).toEqual({ processed: 1, duplicates: 1, failed: 0 });
    expect(eventStory(inv, "evt_other")).toEqual({ processed: 0, duplicates: 0, failed: 0 });
  });
});
