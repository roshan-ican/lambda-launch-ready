# Progress log

Goal: make a TypeScript Lambda platform launch-ready, running fully on LocalStack, learned by pair programming.

## Decisions
| Decision | Choice | Why |
|---|---|---|
| Emulator | LocalStack, free Hobby tier, image pinned `2026.10.5` | Most used, works with `cdklocal`, runs real Lambda containers |
| Cloud spend | None, 100% local | Cold start *timings* are labelled "local only, not AWS-representative" |
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
