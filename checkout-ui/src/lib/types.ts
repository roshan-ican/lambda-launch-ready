import type { Invocation, Summary } from "./timeline";

export interface Order {
  orderId: string;
  status: string;
  amount: number; // fils
  createdAt: string | null;
}

export interface Depth {
  waiting: number;
  inFlight: number;
}

export interface State {
  now: number;
  summary: Summary;
  sinceMark: Summary | null;
  event: { processed: number; duplicates: number; failed: number } | null;
  invocations: Invocation[];
  orders: { rows: Order[]; total: number; paid: number; pending: number };
  queues: { payments: Depth | null; dlq: Depth | null };
  alarm: string | null;
  bug: boolean | null;
}

// The last thing the person did, kept in the browser to explain what happened next.
export type Action =
  | { kind: "pay"; at: number; orderId: string; eventId: string; copies: number }
  | { kind: "fail"; at: number; orderId: string; eventId: string }
  | { kind: "fix"; at: number; bug: boolean }
  | { kind: "replay"; at: number; moved: number }
  | { kind: "burst"; at: number; sent: number; accepted: number; ms: number };
