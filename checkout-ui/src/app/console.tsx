"use client";

import { useEffect, useRef, useState } from "react";
import { aed, finding, short } from "@/lib/finding";
import type { Invocation } from "@/lib/timeline";
import type { Action, State } from "@/lib/types";

const AMOUNT = 4999; // 49.99 AED in fils
const POLL_MS = 1000;

type Busy = null | "pay" | "dup" | "fail" | "fix" | "replay" | "burst";

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${url} returned ${res.status}`);
  return data as T;
}

function sessionStart(): number {
  try {
    const saved = Number(sessionStorage.getItem("since"));
    if (saved) return saved;
    const now = Date.now() - 1000;
    sessionStorage.setItem("since", String(now));
    return now;
  } catch {
    return Date.now() - 1000;
  }
}

export default function Console() {
  const [since, setSince] = useState<number | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [down, setDown] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [session, setSession] = useState(0); // bumped by "Clear session"

  // Read by the poller without restarting it.
  const actionRef = useRef<Action | null>(null);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  // Poll /api/state every second. All state updates happen after an await.
  useEffect(() => {
    let stopped = false;
    const start = sessionStart();
    const seen = new Set<string>();

    async function tick() {
      const a = actionRef.current;
      const q = new URLSearchParams({ since: String(start) });
      if (a) q.set("mark", String(a.at));
      if (a && "eventId" in a) q.set("event", a.eventId);
      try {
        const res = await fetch(`/api/state?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next: State = await res.json();
        if (stopped) return;
        const arrived = new Set(next.invocations.map((i) => i.requestId).filter((id) => !seen.has(id)));
        const firstLoad = seen.size === 0;
        arrived.forEach((id) => seen.add(id));
        setFresh(firstLoad ? new Set() : arrived);
        setSince(start);
        setState(next);
        setDown(false);
      } catch {
        if (!stopped) setDown(true);
      }
    }

    refresh.current = tick;
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [session]);

  async function run(kind: Busy, fn: () => Promise<Action>) {
    setBusy(kind);
    setError(null);
    try {
      const next = await fn();
      actionRef.current = next;
      setAction(next);
      await refresh.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const pay = (copies: number) =>
    run(copies === 1 ? "pay" : "dup", async () => {
      const at = Date.now();
      const order = await post<{ orderId: string }>("/api/orders", { amount: AMOUNT });
      const paid = await post<{ eventId: string; statuses: number[] }>("/api/pay", { orderId: order.orderId, copies });
      setSent((n) => n + paid.statuses.length);
      return { kind: "pay", at, orderId: order.orderId, eventId: paid.eventId, copies };
    });

  const fail = () =>
    run("fail", async () => {
      const at = Date.now();
      if (state?.bug === false) await post("/api/fix", { bug: true });
      const r = await post<{ orderId: string; eventId: string }>("/api/fail");
      setSent((n) => n + 1);
      return { kind: "fail", at, orderId: r.orderId, eventId: r.eventId };
    });

  const fix = (bug: boolean) =>
    run("fix", async () => {
      const at = Date.now();
      await post("/api/fix", { bug });
      return { kind: "fix", at, bug };
    });

  const replay = () =>
    run("replay", async () => {
      const at = Date.now();
      const r = await post<{ moved: number }>("/api/replay");
      return { kind: "replay", at, moved: r.moved };
    });

  const burst = () =>
    run("burst", async () => {
      const at = Date.now();
      const r = await post<{ sent: number; accepted: number; ms: number }>("/api/burst", { n: 50 });
      setSent((n) => n + r.sent);
      return { kind: "burst", at, ...r };
    });

  function clear() {
    const now = Date.now();
    try {
      sessionStorage.setItem("since", String(now));
    } catch {}
    actionRef.current = null;
    setSent(0);
    setAction(null);
    setState(null);
    setSession((n) => n + 1);
  }

  const f = finding(state, action);
  const s = state?.summary;
  const payments = state?.queues.payments;
  const dlq = state?.queues.dlq?.waiting ?? 0;
  const inQueue = (payments?.waiting ?? 0) + (payments?.inFlight ?? 0);

  const anyBusy = busy !== null;

  // Which stage is the message at right now? (the 1px accent line)
  const recent = (fn: string) => state?.invocations.some((i) => i.fn === fn && state.now - i.at < 2500);
  const active =
    busy === "pay" || busy === "dup" || busy === "burst" ? 0
    : dlq > 0 && action?.kind !== "replay" ? 4
    : inQueue > 0 ? 2
    : recent("worker-fn") ? 3
    : recent("webhook-fn") ? 1
    : action ? 4 : -1;


  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Mark />
          Launch-ready payments
        </div>
        <span className="scope">
          <b>LocalStack</b> · eu-central-1 · webhook-fn, worker-fn, create-order-fn
        </span>
        <span className={`live${down ? " down" : ""}`} role="status">
          <i aria-hidden="true" />
          {down ? "LocalStack not reachable" : state ? "Live, polling every 1 s" : "Connecting…"}
        </span>
      </header>

      <main className="canvas">
        <div className="title-row">
          <div>
            <h1>Checkout</h1>
            <p className="finding" aria-live="polite">
              <FindingText text={f.text} tone={f.tone} />
            </p>
          </div>
          <div className="title-actions">
            <button className="btn" onClick={clear} disabled={anyBusy}>
              Clear session
            </button>
            <button className="btn primary" onClick={() => pay(1)} disabled={anyBusy || down} aria-busy={busy === "pay"}>
              {busy === "pay" ? "Paying…" : `Pay ${aed(AMOUNT)}`}
            </button>
          </div>
        </div>

        {down && (
          <div className="banner" role="alert">
            Can&apos;t reach LocalStack at localhost:4566. Start it with <span className="fig">docker compose up -d</span>, then
            run <span className="fig">npm run deploy</span> in 03-webhook-reliability.
          </div>
        )}
        {error && (
          <div className="banner" role="alert">
            {error}
          </div>
        )}

        <section className="card" aria-labelledby="journey-h">
          <div className="card-head">
            <h2 id="journey-h">Where the payment is</h2>
            <span className="meta">this session, since {since ? new Date(since).toLocaleTimeString() : "—"}</span>
          </div>
          <div className="journey">
            <Stage
              active={active === 0}
              name="Payment provider"
              fig={sent}
              unit="sent"
              sub={<>signed with HMAC SHA-256<br />on the Next.js server</>}
            />
            <Stage
              active={active === 1}
              name="webhook-fn"
              fig={s?.webhooks}
              unit="calls"
              sub={
                <>
                  <b className="fig">{s?.coldByFn["webhook-fn"] ?? 0}</b> cold starts
                  <br />
                  checks the signature, then queues
                </>
              }
            />
            <Stage
              active={active === 2}
              name="payments queue"
              fig={payments ? inQueue : undefined}
              unit="messages"
              sub={
                payments ? (
                  <>
                    <b className="fig">{payments.waiting}</b> waiting
                    <br />
                    <b className="fig">{payments.inFlight}</b> in flight
                  </>
                ) : (
                  "—"
                )
              }
            />
            <Stage
              active={active === 3}
              name="worker-fn"
              fig={s?.processed}
              unit="applied"
              sub={
                <>
                  <b className="fig">{s?.duplicates ?? 0}</b> duplicates skipped
                  <br />
                  <b className="fig">{s?.failed ?? 0}</b> failed tries · <b className="fig">{s?.coldByFn["worker-fn"] ?? 0}</b> cold
                </>
              }
            />
            <Stage
              active={active === 4}
              name={dlq > 0 ? "payments-dlq" : "Orders"}
              fig={dlq > 0 ? dlq : state?.orders.paid}
              unit={dlq > 0 ? "parked" : "paid"}
              tone={dlq > 0 ? "negative" : undefined}
              last
              sub={
                <>
                  <b className="fig">{state?.orders.pending ?? 0}</b> pending
                  <br />
                  alarm <AlarmPill state={state?.alarm ?? null} />
                </>
              }
            />
          </div>
        </section>

        <div className="lower">
          <section className="card" aria-labelledby="inv-h">
            <div className="card-head">
              <h2 id="inv-h">Lambda invocations</h2>
              <span className="meta fig">
                {s ? `${s.invocations} calls · ${s.cold} cold · ${s.invocations - s.cold} warm${s.worstInitMs != null ? ` · worst init ${s.worstInitMs} ms` : ""}` : "—"}
              </span>
            </div>
            <Invocations rows={state?.invocations ?? null} fresh={fresh} />
          </section>

          <div className="side">
            <section className="card" aria-labelledby="break-h">
              <div className="card-head">
                <h2 id="break-h">Try to break it</h2>
                <span className="meta">
                  worker bug{" "}
                  {state?.bug == null ? "—" : state.bug ? <span className="pill warning">on</span> : <span className="pill positive">fixed</span>}
                </span>
              </div>
              <ul className="steps">
                <Step what="Duplicate delivery" detail="New order, same webhook sent 5× at once">
                  <button className="btn" onClick={() => pay(5)} disabled={anyBusy || down} aria-busy={busy === "dup"}>
                    {busy === "dup" ? "Sending…" : "Send 5×"}
                  </button>
                </Step>
                <Step what="Worker bug" detail="A fail_ order throws on every try">
                  <button className="btn" onClick={fail} disabled={anyBusy || down} aria-busy={busy === "fail"}>
                    {busy === "fail" ? "Sending…" : "Make it fail"}
                  </button>
                </Step>
                <Step what={state?.bug === false ? "Bring the bug back" : "Ship the fix"} detail="SIMULATE_BUG on worker-fn">
                  <button
                    className="btn"
                    onClick={() => fix(state?.bug === false)}
                    disabled={anyBusy || down || state?.bug == null}
                    aria-busy={busy === "fix"}
                  >
                    {busy === "fix" ? "Updating…" : state?.bug === false ? "Bug on" : "Ship fix"}
                  </button>
                </Step>
                <Step what="Replay the DLQ" detail={`${dlq} parked · send first, then delete`}>
                  <button className="btn" onClick={replay} disabled={anyBusy || down || dlq === 0} aria-busy={busy === "replay"}>
                    {busy === "replay" ? "Replaying…" : `Replay ${dlq}`}
                  </button>
                </Step>
                <Step what="Traffic spike" detail="50 customers pay at the same second">
                  <button className="btn" onClick={burst} disabled={anyBusy || down} aria-busy={busy === "burst"}>
                    {busy === "burst" ? "Sending 50…" : "Burst 50"}
                  </button>
                </Step>
              </ul>
            </section>

            <section className="card" aria-labelledby="orders-h">
              <div className="card-head">
                <h2 id="orders-h">Latest orders</h2>
                <span className="meta fig">
                  {state ? `${state.orders.total} total · ${state.orders.paid} paid` : "—"}
                </span>
              </div>
              <Orders rows={state?.orders.rows ?? null} />
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function FindingText({ text, tone }: { text: string; tone: string }) {
  const color =
    tone === "negative" ? "var(--negative)" : tone === "warning" ? "var(--warning)" : tone === "positive" ? "var(--text)" : "var(--muted)";
  return <span style={{ color }}>{text}</span>;
}

function Stage(props: {
  name: string;
  fig: number | undefined;
  unit: string;
  sub: React.ReactNode;
  active: boolean;
  tone?: "negative";
  last?: boolean;
}) {
  const prev = useRef(props.fig);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (props.fig !== undefined && prev.current !== undefined && props.fig !== prev.current) setFlash((n) => n + 1);
    prev.current = props.fig;
  }, [props.fig]);

  return (
    <div className={`stage${props.active ? " active" : ""}`}>
      <div className="stage-name">{props.name}</div>
      <div className="stage-fig fig" style={props.tone ? { color: "var(--negative)" } : undefined}>
        <span key={flash} className={flash ? "flash" : undefined}>
          {props.fig ?? "—"}
        </span>
        <span className="stage-unit">{props.unit}</span>
      </div>
      <div className="stage-sub">{props.sub}</div>
      {!props.last && (
        <span className="arrow" aria-hidden="true">
          ›
        </span>
      )}
    </div>
  );
}

function Step({ what, detail, children }: { what: string; detail: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="what">
        <b>{what}</b>
        <span>{detail}</span>
      </div>
      {children}
    </li>
  );
}

function AlarmPill({ state }: { state: string | null }) {
  if (!state) return <span className="muted">—</span>;
  const tone = state === "ALARM" ? "negative" : state === "OK" ? "positive" : "neutral";
  return <span className={`pill ${tone}`}>{state === "INSUFFICIENT_DATA" ? "no data" : state}</span>;
}

function resultText(inv: Invocation): React.ReactNode {
  if (inv.results.length === 0) {
    if (inv.fn === "webhook-fn") return <span className="muted">checked signature, queued</span>;
    if (inv.fn === "create-order-fn") return <span className="muted">order created</span>;
    return <span className="muted">—</span>;
  }
  const n = (o: string) => inv.results.filter((r) => r.outcome === o).length;
  const processed = n("processed");
  const dup = n("duplicate");
  const failed = inv.results.filter((r) => r.outcome === "failed");
  const ids = [...new Set(inv.results.map((r) => r.eventId).filter(Boolean))];
  return (
    <>
      {processed > 0 && <span className="pill positive">{processed} applied</span>}{" "}
      {dup > 0 && <span className="pill neutral">{dup} duplicate</span>}{" "}
      {failed.length > 0 && (
        <span className="pill negative">
          {failed.length} failed{failed[0]?.receiveCount ? `, try ${failed[0].receiveCount} of 3` : ""}
        </span>
      )}{" "}
      <span className="fig muted">{ids.length === 1 ? ids[0] : `${ids.length} events`}</span>
    </>
  );
}

function Invocations({ rows, fresh }: { rows: Invocation[] | null; fresh: Set<string> }) {
  if (rows === null) return <div className="empty">Loading invocations…</div>;
  if (rows.length === 0) {
    // Empty state: no calls yet, so show the route each call will take (real names, real order).
    return (
      <ol className="route" aria-label="How a payment travels">
        <li><span className="who fig">create-order-fn</span><span className="does">Pay writes a <b>pending</b> order, 49.99 AED stored as 4999 fils</span></li>
        <li><span className="who fig">Next.js server</span><span className="does">plays the provider: signs the webhook with the secret the browser never sees</span></li>
        <li><span className="who fig">webhook-fn</span><span className="does">checks the HMAC signature, puts the event on <b>payments</b>, answers 200 at once</span></li>
        <li><span className="who fig">worker-fn</span><span className="does">records the eventId and marks the order <b>paid</b> in one transaction; a repeat is skipped</span></li>
        <li><span className="who fig">payments-dlq</span><span className="does">after 3 failed tries the event is parked here, the alarm fires, replay brings it back</span></li>
        <li><span className="who muted">Each call</span><span className="does">appears here as it happens, cold or warm, with its init time</span></li>
      </ol>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Function</th>
            <th scope="col">Start</th>
            <th scope="col" className="num">Init</th>
            <th scope="col" className="num hide-phone">Duration</th>
            <th scope="col" className="hide-phone">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.requestId} className={fresh.has(inv.requestId) ? "arrived" : undefined}>
              <td className="fig muted">{new Date(inv.at).toLocaleTimeString([], { hour12: false })}</td>
              <td className="fig">{inv.fn}</td>
              <td>{inv.cold ? <span className="pill warning">cold</span> : <span className="pill neutral">warm</span>}</td>
              <td className="num fig">{inv.initMs != null ? `${inv.initMs} ms` : <span className="muted">—</span>}</td>
              <td className="num fig hide-phone">{inv.durationMs != null ? `${inv.durationMs} ms` : "—"}</td>
              <td className="result hide-phone">{resultText(inv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Orders({ rows }: { rows: State["orders"]["rows"] | null }) {
  if (rows === null) return <div className="empty">Loading orders…</div>;
  if (rows.length === 0) return <div className="empty">No orders yet this session.</div>;
  return (
    <table className="orders">
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col" className="num">Amount</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.orderId}>
            <td className="fig id" title={o.orderId}>{short(o.orderId)}</td>
            <td className="num fig">{aed(o.amount)}</td>
            <td>
              <span className={`pill ${o.status === "paid" ? "positive" : o.orderId.startsWith("fail_") ? "warning" : "neutral"}`}>
                {o.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The product's mark: a payment's path, one dot arriving once.
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="0.5" y="0.5" width="19" height="19" rx="4" fill="none" stroke="var(--control)" />
      <path d="M4 10h9" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="15" cy="10" r="2.2" fill="var(--accent)" />
    </svg>
  );
}
