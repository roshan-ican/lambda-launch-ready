import { describe, expect, it } from "vitest";
import { aed, finding } from "./finding";
import { summarize } from "./timeline";
import type { State } from "./types";

function state(over: Partial<State> = {}): State {
  return {
    now: 0,
    summary: summarize([]),
    sinceMark: null,
    event: null,
    invocations: [],
    orders: { rows: [], total: 0, paid: 0, pending: 0 },
    queues: { payments: { waiting: 0, inFlight: 0 }, dlq: { waiting: 0, inFlight: 0 } },
    alarm: "OK",
    bug: true,
    ...over,
  };
}

describe("finding", () => {
  it("formats fils as AED with two decimals", () => {
    expect(aed(4999)).toBe("49.99 AED");
    expect(aed(5)).toBe("0.05 AED");
  });

  it("says it is connecting before the first poll", () => {
    expect(finding(null, null).text).toMatch(/Connecting/);
  });

  it("reports a 5× delivery charged once", () => {
    const f = finding(state({ event: { processed: 1, duplicates: 4, failed: 0 } }), {
      kind: "pay", at: 0, orderId: "ord_1", eventId: "evt_1", copies: 5,
    });
    expect(f).toEqual({ text: "evt_1 sent 5×: applied 1×, 4 skipped as duplicates. Charged once.", tone: "positive" });
  });

  it("waits until every copy has reached the worker", () => {
    const f = finding(state({ event: { processed: 1, duplicates: 1, failed: 0 } }), {
      kind: "pay", at: 0, orderId: "ord_1", eventId: "evt_1", copies: 5,
    });
    expect(f.text).toMatch(/waiting for the worker/);
  });

  it("puts a parked payment first and names the next step", () => {
    const f = finding(state({ queues: { payments: null, dlq: { waiting: 1, inFlight: 0 } }, alarm: "ALARM" }), null);
    expect(f.tone).toBe("negative");
    expect(f.text).toBe("1 payment parked in the DLQ, alarm ALARM. Nothing lost. Ship the fix, then replay it.");
  });

  it("reports burst cold starts measured since the burst started", () => {
    const f = finding(
      state({ sinceMark: { ...summarize([]), cold: 12, worstInitMs: 140 } }),
      { kind: "burst", at: 0, sent: 50, accepted: 50, ms: 2400 },
    );
    expect(f.text).toBe("50 of 50 customers paid at once in 2.4 s: 12 cold starts, worst init 140 ms.");
  });
});
