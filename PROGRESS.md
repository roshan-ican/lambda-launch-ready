# Progress log

Goal: take the fintech platform from "launch blocked" to "launch ready" and have the numbers that prove it (measure it, fix it, prove it), learned by pair programming. It started from one question: how do we prevent or shorten cold starts?

Acceptance: see cold-start rate and latency; checkout p95 under 500 ms and worst cold start under 1 s; same webhook sent 5 times processed once; failed messages go to a DLQ, alarm and can be replayed; DB never runs out of connections in a spike; all as CDK; before/after table, README, runbook.

2026-11-24: main plan is TypeScript, Projects 01 to 06. The Python work in `02-lean-package-py` is an optional SnapStart side track (Node.js has no SnapStart).

## Decisions
| Decision | Choice | Why |
|---|---|---|
| Emulator | LocalStack, free Hobby tier, image pinned `2026.10.5` | Most used, works with `cdklocal`, runs real Lambda containers |
| Language | TypeScript for Projects 01 to 06; Python only for the SnapStart side track | SnapStart supports Java, Python 3.12+, .NET 8+, not Node.js (AWS docs, checked 2026-11-24). The portfolio story is TypeScript |
| Cloud spend | 100% local, except one optional small real-AWS SnapStart test at the end with a budget alarm | LocalStack timings are "local only, not AWS-representative". Unverified whether LocalStack really snapshots, so SnapStart needs real AWS to prove |
| Infrastructure as code | CDK in TypeScript (planned) | One language everywhere |
| Region | `me-central-1` (UAE) | Matches where you are; locally it is just a label |
| Who types setup | You | Learning the tooling too, faded out by project 03 |
| Teaching style | Full code first, then fade: gaps → shape only → name only | See paired-programming skill |

## Projects
1. `01-observability` — structured logs: `coldStart`, `initMs`, `handlerMs`
2. `02-lean-bundle` — esbuild, lazy SDK clients
3. `03-webhook-reliability` — signature check, SQS, idempotent worker, DLQ, replay
4. `04-db-protection` — Postgres pool limits under a spike
5. `05-iac` — everything in CDK
6. `06-prove-it` — load test, results table, README, runbook

## Checkpoint 1 — 2026-11-23

Done:
- [x] `git init`, `01-observability/` folder
- [x] `.gitignore` (node_modules, dist, .env, volume, cdk.out)
- [x] `.env` with LocalStack auth token
- [x] `docker-compose.yml` written

In progress:
- [x] Fix docker.sock volume line (bug: relative path + wrong container path)
- [x] `docker compose up -d` + health check passes (container healthy, LocalStack 2026.10.5)
- [ ] Solo change: set default region to `me-central-1`
- [ ] Answer step 0 grill questions (3)

Still unanswered from Round 1: cold start, module-scope code, idempotency key, p50 vs p95, `type` vs `interface`.

Lesson learned: in a compose volume, a path with no leading `/` or `./` is read as a *named volume*, not a file on your Mac.

## Checkpoint 2 — 2026-11-23

Done:
- [x] Step 1: `package.json`, `tsconfig.json`, dev deps installed (TypeScript 7.0.2, Vitest 5.1.1)
- [x] `src/sanity.test.ts` — 3 tests green, each one shown to go red when broken

Lessons learned:
- Exit code 127 = "command not found" (packages weren't installed)
- A test with no `expect` can never fail and proves nothing; always make a new test go red once
- `toBe` is `===`-style (`Object.is`): fine for numbers/strings, use `toEqual` for objects/arrays
- `noUncheckedIndexedAccess` makes `arr[0]` typed `T | undefined`

- [x] Step 2: `src/cold-start.ts` + test — 4 passed
- Lessons: auto-import picked `node:test` instead of `vitest` (always read the `from`); an environment = one isolated copy of the Lambda with its own memory, one request at a time; 200 simultaneous requests → up to 200 cold starts → up to 200 Postgres connections (problem #4)

- [x] Step 3: `src/timing.ts` closure timer — 7 passed
- [x] Step 4: `src/handler.ts` (you), test + esbuild build + `deploy.sh` (me). Deployed `obs-status` to LocalStack (arm64, nodejs22.x): first invoke coldStart true, initMs 35 vs Lambda Init Duration 41.56 ms; next two warm. 8 tests passed.

- [x] Step 5: `src/stats.ts` (you: percentile + summarize), test/report/load scripts (me). 13 passed.
- Lessons: fix the file, not the test; AWS CLI pager (press q, `AWS_PAGER=""`); LocalStack Insights has no `pct`

### Project 01 baseline (LocalStack, 100 requests, 20 concurrent)
| requests | cold starts | rate | p50 | p95 | p99 | worst cold |
|---|---|---|---|---|---|---|
| 103 | 19 | 18.4% | 0 ms | 76 ms | 134 ms | 171 ms |

✅ Project 01 done. Next: project 02 — lean bundle (esbuild minify, per-client SDK imports, lazy clients), then compare against this baseline.

## Project 02 (Python) — heavy baseline, 2026-11-24
Python 3.12, x86_64, 256 MB, LocalStack on Windows. Package: boto3 + numpy + pandas, 61 MB zip, 180 MB unzipped (deployed via S3, over the 50 MB direct-upload limit).
| requests | cold starts | p50 | p95 | p99 | cold initMs |
|---|---|---|---|---|---|
| 103 | 1 | 0.41 ms | 0.89 ms | 2.39 ms | 1264 ms |
Takeaway: the cold start costs 1264 ms, against 35 ms for the TS handler. The cold-start rate here is NOT comparable to Project 01: invokes via aws.exe on Windows barely overlap, so LocalStack made only 1 environment.

### Project 02 step 2: lazy imports (LocalStack, 256 MB, x86_64, 6 forced cold starts each, same 61 MB zip)
| function, request | Lambda Init Duration | our cold total (init+handler) |
|---|---|---|
| heavy, plain | 1216 to 1606 ms | median 1355 ms |
| lazy, plain | 30 to 40 ms | about 0 (initMs 0.01) |
| lazy, report (heavy libs needed) | 30 to 40 ms | median 932 ms |
Lessons: lazy imports MOVE the cost to the first request that needs it; the win is for requests that never need it. Our initMs only covers coldstart-import to mark_init_done, so it misses runtime bootstrap (about 30 ms); Lambda's own Init Duration is the fuller number. bench.py forces fresh cold starts by changing an env var on the function.

## Project 02 (TypeScript, 02-lean-bundle) — heavy baseline, 2026-11-24
Heavy handler: 7 SDK clients (S3, DynamoDB, SQS, SNS, Secrets Manager, SSM, KMS) imported and created at module scope. nodejs22.x, x86_64, 256 MB, LocalStack on Windows, esbuild CJS bundle (no minify). Load: 100 requests, 20 concurrent, TypeScript load.ts via SDK (real concurrency).
| bundle | zip | requests | cold starts | rate | p50 | p95 | p99 | worst cold | Lambda Init max |
|---|---|---|---|---|---|---|---|---|---|
| 2.58 MB | 418 KB | 103 | 20 | 19.4% | 0 ms | 392 ms | 422 ms | 470 ms | 493 ms |
Notes: ESM output fails with "Dynamic require of node:https" when bundling SDK v3 (CJS deps), so the Lambda bundle is CJS (matches AWS TypeScript packaging docs). Local timings only, not AWS-representative. Next: Fix A per-client imports (already modular v3), Fix B lazy clients, Fix C minify; measure after each.

## 5-day interview plan (set 2026-11-24)
Interview rounds expected: live coding, mainly system design, AWS, React + Next.js, database, backend. Interviewer: CTO.
| Day | Build | Practice |
|---|---|---|
| 1 (11-24) | Finish 02: Fix B lazy clients, Fix C minify, before/after numbers | Explain cold starts out loud in 2 minutes |
| 2 (11-25) | 03 core: API Lambda, signature check, SQS, idempotent worker (DynamoDB conditional write), DLQ, replay | Idempotency, at-least-once delivery, retries |
| 3 (11-26) | Next.js checkout UI: Pay button, fake payment webhook, "send 5x", "make it fail", replay, latency panel | React/Next.js basics: server vs client components, API routes, fetch |
| 4 (11-27) | README with architecture diagram and before/after table | System design: design a payment/checkout system; DB connections under a spike (04 as discussion: pooling, RDS Proxy); CDK (05) as discussion |
| 5 (11-28) | Polish only | Live-coding drills (TypeScript, a React component, a small API), full mock interview |
Cut from the build: 04 and 05 become talk-through topics, 06 becomes the README. SnapStart side track dropped (know it as a talking point).
| 1.74 MB (lazy) | 304 KB | 103 | 20 | 19.4% | 0 ms | 140 ms | 164 ms | 208 ms | 317 ms |
Fix B (lazy clients, only /receipt and /order load S3 or DynamoDB): p95 392 to 140 ms, worst cold 470 to 208 ms. Cold-start RATE unchanged (lazy makes each cold start shorter, not rarer). Bundle still 1.7 MB because esbuild inlines the dynamically imported S3 and DynamoDB code; it is just not run at Init.

### Demo: `npm run demo` in 02-lean-bundle (cold, warm, burst of 50)
Resets environments, then: request 1 COLD (init 174 ms, Lambda Init 277 ms, customer waited 1304 ms incl. LocalStack starting a container); request 2 warm (waited 30 ms); 50 at once: 48 cold, 2 warm, cold init 72 to 201 ms, slowest customer wait 21.6 s (a laptop starting 48 Docker containers; not AWS behaviour).

### Project 02 final before/after (LocalStack, 100 requests, 20 concurrent, 256 MB)
| version | bundle | zip | cold rate | p95 | p99 | worst cold | Lambda Init max |
|---|---|---|---|---|---|---|---|
| Heavy (7 SDK clients at Init) | 2.58 MB | 418 KB | 19.4% | 392 ms | 422 ms | 470 ms | 493 ms |
| + Fix B lazy clients | 1.74 MB | 304 KB | 19.4% | 140 ms | 164 ms | 208 ms | 317 ms |
| + Fix C minify | 722 KB | 211 KB | 19.4% | 160 ms | 165 ms | 166 ms | 199 ms |
Fix C: bundle -58%, worst cold and Lambda Init improved; p95 140 vs 160 is within run-to-run noise on one small sample. Acceptance (local): p95 under 500 ms and worst cold under 1 s, met. ✅ Project 02 done.

## Project 03 (03-webhook-reliability) — 2026-11-24
Built: `signature.ts` (HMAC-SHA256 + timingSafeEqual), `webhook.ts` (401/400/200, queues to SQS), `worker.ts` (DynamoDB transaction: conditional put into processed-events + order update; duplicates = success; partial batch failures). 16 tests pass.
Deployed on LocalStack (`npm run deploy`): tables processed-events + orders, queue payments with DLQ payments-dlq (maxReceiveCount 3), webhook-fn, worker-fn, SQS trigger with ReportBatchItemFailures.
`npm run demo:dup`: same webhook sent 5 times, all 5 got 200, worker processed it 1 time, skipped 4 as duplicates, order status pending to paid. ✅ Acceptance #3 (same webhook 5x processed once).
Next: failure demo (poison message, 3 retries, lands in DLQ), DLQ alarm, replay script.
