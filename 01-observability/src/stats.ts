export interface RequestLog {
  coldStart: boolean;
  initMs: number;
  handlerMs: number;
}

export interface Summary {
  requests: number;
  coldStarts: number;
  coldStartRate: number;
  p50: number;
  p95: number;
  p99: number;
  worstColdMs: number;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(rank, 1) - 1] ?? 0;
}

export function summarize(logs: RequestLog[]): Summary {
  const totals = logs.map((log) => log.initMs + log.handlerMs);
  const cold = logs.filter((log) => log.coldStart);
  const coldTotals = cold.map((log) => log.initMs + log.handlerMs);

  return {
    requests: logs.length,
    coldStarts: cold.length,
    coldStartRate: logs.length === 0 ? 0 : cold.length / logs.length,
    p50: percentile(totals, 50),
    p95: percentile(totals, 95),
    p99: percentile(totals, 99),
    worstColdMs: Math.max(0, ...coldTotals),
  };
}