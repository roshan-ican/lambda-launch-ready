# 01 — Observability: measure cold starts

Every request logs one JSON line:

```json
{"msg":"request_done","coldStart":true,"initMs":35,"handlerMs":0}
```

- `coldStart` — first request in a new execution environment (module-scope flag, `src/cold-start.ts`)
- `initMs` — `performance.now()` at module load = time from process start to code ready (cold only)
- `handlerMs` — closure timer around the handler (`src/timing.ts`)

## Run

```bash
npm test
npm run deploy     # build + create Lambda on LocalStack + 3 invokes
npm run load       # 100 requests, 20 concurrent
npm run report     # cold start rate, p50/p95/p99, worst cold start
```

## Baseline (LocalStack, arm64, 128 MB, 2026-11-23)

| requests | cold starts | rate | p50 | p95 | p99 | worst cold |
|---|---|---|---|---|---|---|
| 103 | 19 | 18.4% | 0 ms | 76 ms | 134 ms | 171 ms |

Local numbers are Docker container starts, not AWS Firecracker microVMs. Use them to compare before/after, not as real AWS latency.

## Logs Insights query (real AWS)

LocalStack supports `parse`, `count`, `max`, `avg` but not `pct`, so locally `npm run report` computes percentiles. On AWS:

```
filter msg = "request_done"
| fields initMs + handlerMs as totalMs
| stats count(*) as requests,
        sum(coldStart) as coldStarts,
        sum(coldStart) / count(*) * 100 as coldStartRatePct,
        pct(totalMs, 50) as p50,
        pct(totalMs, 95) as p95,
        pct(totalMs, 99) as p99,
        max(initMs) as worstInitMs
```
