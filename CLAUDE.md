# Notes for Claude (read first)

Read `PROGRESS.md` before doing anything. It says where we are and what's next.

## How we work (pair programming)
- I'm learning TypeScript + AWS. Grill me like a beginner.
- You give **full code**, I type the logic myself. You write tests, scripts, build wiring.
- Repeated patterns: say "do it like the last one" instead of repeating code. Slow fade.
- Keep answers **short**. Full detail only for new step code.
- Everything runs on **LocalStack** (no real AWS spend). Region `me-central-1`.
- Commit under my name only, no co-author trailer.

## Setup on a new machine
1. Install Docker, Node 22, AWS CLI v2.
2. `git clone https://github.com/roshan-ican/lambda-launch-ready aws-ts && cd aws-ts`
3. Create `.env` with `LOCALSTACK_AUTH_TOKEN=...` (from app.localstack.cloud → Auth Tokens). Never commit it.
4. `docker compose up -d` then `curl localhost:4566/_localstack/health`
5. `cd 01-observability && npm install && npm test`

## Next
Project 02 — lean bundle: build a deliberately heavy handler (imports all AWS clients at top), measure with deploy/load/report, then fix with esbuild minify, per-client `@aws-sdk/client-*` imports, lazy clients. Compare against the project 01 baseline in `PROGRESS.md`.
