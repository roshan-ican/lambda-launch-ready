# Notes for Claude (read first)

Read `PROGRESS.md` before doing anything. It says where we are and what's next.

## How we work (pair programming)
- I'm learning TypeScript + AWS lambda.
- Give pseudocode first. Then give full code backed by verified sources (official docs), never unverified or guessed code. I type the logic myself. You write tests, scripts, build wiring.
- Repeated patterns: say "do it like the last one" instead of repeating code. Slow fade.
- Keep answers **short**. Full detail only for new step code.
- Everything runs on **LocalStack**, region `me-central-1`. Only exception: one optional real-AWS SnapStart test at the end, with a budget alarm, and only when I say go.
- Main plan is **TypeScript** (Projects 01 to 06, see PROGRESS.md). The Python work in `02-lean-package-py` is a side track for SnapStart (Node.js has no SnapStart).
- Explain concepts as a story on a real app (checkout): numbered steps, a scenarios table, then my own code line by line, a check-your-understanding question, and an interview takeaway.
- Always say the total remaining plan and rough time when I ask. Do not run ahead and write the logic I am supposed to type.
- Commit under my name only, no co-author trailer.

## Setup on a new machine
Full steps are in `PROGRESS.md` under "START HERE". Short version:
1. Install Docker, Node 22, AWS CLI v2.
2. `git clone https://github.com/roshan-ican/lambda-launch-ready && cd lambda-launch-ready && git switch projects-02-03`
3. Create `.env` with `LOCALSTACK_AUTH_TOKEN=...` (from app.localstack.cloud → Auth Tokens). Never commit it.
4. `docker compose up -d` then `curl localhost:4566/_localstack/health`
5. `npm install && npm test` in `01-observability`, `02-lean-bundle`, `03-webhook-reliability`

## Next
See "What is left, in order" in `PROGRESS.md`. Done: Project 03 failure path, HTTP entry points, Next.js checkout UI (`checkout-ui/`). Next: walk through the UI code together, record the LinkedIn demo, then README, then interview practice (system design is the main round).

Original Project 02 note: Project 02 (TypeScript, `02-lean-bundle`) — build a deliberately heavy handler (imports all AWS clients at top), measure with deploy/load/report, then fix with esbuild minify, per-client `@aws-sdk/client-*` imports, lazy clients. Goal: checkout p95 under 500 ms, worst cold start under 1 s, compared against the Project 01 baseline in `PROGRESS.md`. Then 03 to 06, then the optional Python SnapStart side track.
