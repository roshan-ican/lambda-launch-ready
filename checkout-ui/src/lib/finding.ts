// The one line under the title: what the last action proved, from live data.
import type { Action, State } from "./types";

export const aed = (fils: number) => `${(fils / 100).toFixed(2)} AED`;
export const short = (id: string) => (id.length > 16 ? `${id.slice(0, 13)}…` : id);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface Finding {
  text: string;
  tone: "neutral" | "positive" | "negative" | "warning";
}

export function finding(state: State | null, action: Action | null): Finding {
  if (!state) return { text: "Connecting to LocalStack…", tone: "neutral" };

  const dlq = state.queues.dlq?.waiting ?? 0;
  if (dlq > 0 && action?.kind !== "replay") {
    const next = state.bug ? "Ship the fix, then replay it." : "The fix is live: replay it.";
    return {
      text: `${plural(dlq, "payment")} parked in the DLQ, alarm ${state.alarm ?? "—"}. Nothing lost. ${next}`,
      tone: "negative",
    };
  }

  if (!action) {
    return { text: "No payments yet this session. Pay creates an order and sends its signed webhook.", tone: "neutral" };
  }

  const ev = state.event;
  switch (action.kind) {
    case "pay": {
      if (!ev || ev.processed + ev.duplicates < action.copies) {
        return { text: `${action.eventId} sent ${action.copies}×, waiting for the worker…`, tone: "neutral" };
      }
      if (action.copies === 1) {
        return { text: `${action.eventId} applied once. ${short(action.orderId)} is paid.`, tone: "positive" };
      }
      return {
        text: `${action.eventId} sent ${action.copies}×: applied ${ev.processed}×, ${ev.duplicates} skipped as duplicates. Charged once.`,
        tone: ev.processed === 1 ? "positive" : "negative",
      };
    }
    case "fail": {
      const tries = ev?.failed ?? 0;
      if (tries === 0) return { text: `${short(action.orderId)} queued. The worker has the bug on…`, tone: "warning" };
      return {
        text: `${short(action.orderId)} failed ${plural(tries, "try", "tries")} of 3. SQS retries every 30 s, then parks it in the DLQ.`,
        tone: "warning",
      };
    }
    case "fix":
      return action.bug
        ? { text: "Bug is back on: fail_ orders will throw in worker-fn.", tone: "warning" }
        : { text: "Fix shipped: SIMULATE_BUG=false on worker-fn.", tone: "positive" };
    case "replay": {
      if (action.moved === 0) return { text: "DLQ was empty, nothing to replay.", tone: "neutral" };
      const pending = state.orders.rows.filter((o) => o.orderId.startsWith("fail_") && o.status !== "paid").length;
      return pending === 0
        ? { text: `Replayed ${plural(action.moved, "payment")}: every order is paid. Nothing lost.`, tone: "positive" }
        : { text: `Replayed ${plural(action.moved, "payment")}, the worker is applying them…`, tone: "neutral" };
    }
    case "burst": {
      const m = state.sinceMark;
      const cold = m?.cold ?? 0;
      const worst = m?.worstInitMs;
      return {
        text: `${action.accepted} of ${action.sent} customers paid at once in ${(action.ms / 1000).toFixed(1)} s: ${plural(cold, "cold start")}${worst ? `, worst init ${worst} ms` : ""}.`,
        tone: action.accepted === action.sent ? "positive" : "negative",
      };
    }
  }
}
