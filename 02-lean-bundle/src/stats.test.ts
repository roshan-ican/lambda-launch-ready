import { describe, expect, it } from "vitest";
import { percentile, summarize, type RequestLog } from "./stats.js";

describe("percentile", () => {
  const oneToTen = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];

  it("uses nearest rank on sorted values", () => {
    expect(percentile(oneToTen, 50)).toBe(5);
    expect(percentile(oneToTen, 95)).toBe(10);
    expect(percentile(oneToTen, 10)).toBe(1);
  });

  it("does not reorder the caller's array", () => {
    const input = [3, 1, 2];
    percentile(input, 50);
    expect(input).toEqual([3, 1, 2]);
  });

  it("returns 0 for no values", () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe("summarize", () => {
  const warm = (handlerMs: number): RequestLog => ({ coldStart: false, initMs: 0, handlerMs });
  const cold = (initMs: number, handlerMs: number): RequestLog => ({ coldStart: true, initMs, handlerMs });

  it("counts cold starts and latency including init time", () => {
    const logs = [cold(400, 20), cold(300, 10), ...Array.from({ length: 8 }, () => warm(30))];

    expect(summarize(logs)).toEqual({
      requests: 10,
      coldStarts: 2,
      coldStartRate: 0.2,
      p50: 30,
      p95: 420,
      p99: 420,
      worstColdMs: 420,
    });
  });

  it("returns zeros for no logs", () => {
    expect(summarize([])).toEqual({
      requests: 0, coldStarts: 0, coldStartRate: 0, p50: 0, p95: 0, p99: 0, worstColdMs: 0,
    });
  });
});
