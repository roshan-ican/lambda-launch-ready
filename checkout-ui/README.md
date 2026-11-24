# checkout-ui — live checkout console

A Next.js 16 screen that drives the project 03 Lambdas on LocalStack and shows, live, what happens to each payment.

## Run

```bash
docker compose up -d                                  # from the repo root
cd 03-webhook-reliability && npm run deploy           # creates the Lambdas, writes ../checkout-ui/.env.local
cd ../checkout-ui && npm install && npm run dev        # http://localhost:3000
```

## What the buttons prove

| Button | Proves |
|---|---|
| Pay 49.99 AED | create-order → signed webhook → queue → worker → `paid` |
| Send 5× | same event 5 times, applied once (idempotent worker) |
| Make it fail | 3 failed tries (30 s apart), then `payments-dlq` + alarm |
| Ship fix / Replay | turn the bug off, replay the DLQ, order becomes `paid` |
| Burst 50 | 50 customers at once: many cold starts, worst init time |

## How it works

- `src/app/api/*` are server-only route handlers. The webhook secret lives in `.env.local` (git-ignored) and never reaches the browser.
- `src/lib/provider.ts` plays the payment provider (HMAC SHA-256 signature).
- `/api/state` reads the Lambdas' CloudWatch logs, SQS depths, the DLQ alarm and the orders table. Cold starts come from the `Init Duration` in each `REPORT` log line.
- `src/lib/timeline.ts` and `src/lib/finding.ts` are pure functions with tests (`npm test`).

Design: "Data terminal" app style (tasteskill, seed 1318738091). Simulated payments only, no real money.
