// Turns raw Lambda log lines into one row per invocation.
// Pure functions, no AWS calls, so they are easy to test.

export type Outcome = "processed" | "duplicate" | "failed";

export interface Invocation {
  fn: string;
  requestId: string;
  at: number; // ms since epoch, from the START line (or first line seen)
  cold: boolean;
  initMs: number | null;
  durationMs: number | null;
  results: { outcome: Outcome; eventId?: string; orderId?: string; receiveCount?: number; reason?: string }[];
}

export interface LogLine {
  fn: string;
  timestamp: number;
  message: string;
}

const UUID = "[0-9a-f-]{36}";
const START = new RegExp(`^START RequestId: (${UUID})`);
const REPORT = new RegExp(`^REPORT RequestId: (${UUID})`);
const APP = new RegExp(`^\\S+\\t(${UUID})\\t(?:INFO|WARN|ERROR)\\t(\\{.*\\})\\s*$`, "s");
const OUTCOMES: Record<string, Outcome> = {
  event_processed: "processed",
  event_duplicate: "duplicate",
  event_failed: "failed",
};

function ms(line: string, label: string): number | null {
  const m = line.match(new RegExp(`${label}: ([0-9.]+) ms`));
  return m ? Math.round(Number(m[1])) : null;
}

export function parseInvocations(lines: LogLine[]): Invocation[] {
  const byId = new Map<string, Invocation>();
  const get = (fn: string, requestId: string, at: number) => {
    let inv = byId.get(requestId);
    if (!inv) {
      inv = { fn, requestId, at, cold: false, initMs: null, durationMs: null, results: [] };
      byId.set(requestId, inv);
    }
    return inv;
  };

  for (const { fn, timestamp, message } of lines) {
    const start = message.match(START);
    if (start?.[1]) {
      get(fn, start[1], timestamp).at = timestamp;
      continue;
    }
    const report = message.match(REPORT);
    if (report?.[1]) {
      const inv = get(fn, report[1], timestamp);
      inv.durationMs = ms(message, "Duration");
      inv.initMs = ms(message, "Init Duration");
      inv.cold = inv.initMs !== null;
      continue;
    }
    const app = message.match(APP);
    if (app?.[1] && app[2]) {
      try {
        const data = JSON.parse(app[2]);
        const outcome = OUTCOMES[data.msg];
        if (outcome) {
          get(fn, app[1], timestamp).results.push({
            outcome,
            eventId: data.eventId,
            orderId: data.orderId,
            receiveCount: data.receiveCount,
            reason: data.reason,
          });
        }
      } catch {
        // not one of our JSON lines
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

export interface Summary {
  invocations: number;
  cold: number;
  worstInitMs: number | null;
  webhooks: number;
  coldByFn: Record<string, number>;
  processed: number;
  duplicates: number;
  failed: number;
}

export function summarize(invocations: Invocation[]): Summary {
  const inits = invocations.flatMap((i) => (i.initMs === null ? [] : [i.initMs]));
  const results = invocations.flatMap((i) => i.results);
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  return {
    invocations: invocations.length,
    cold: invocations.filter((i) => i.cold).length,
    worstInitMs: inits.length ? Math.max(...inits) : null,
    webhooks: invocations.filter((i) => i.fn === "webhook-fn").length,
    coldByFn: invocations.reduce<Record<string, number>>((acc, i) => {
      if (i.cold) acc[i.fn] = (acc[i.fn] ?? 0) + 1;
      return acc;
    }, {}),
    processed: count("processed"),
    duplicates: count("duplicate"),
    failed: count("failed"),
  };
}

// What happened to one event, for the finding line.
export function eventStory(invocations: Invocation[], eventId: string) {
  const results = invocations.flatMap((i) => i.results).filter((r) => r.eventId === eventId);
  return {
    processed: results.filter((r) => r.outcome === "processed").length,
    duplicates: results.filter((r) => r.outcome === "duplicate").length,
    failed: results.filter((r) => r.outcome === "failed").length,
  };
}
