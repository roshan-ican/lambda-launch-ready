import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const fn = process.argv[2] ?? "lean-bundle";
const concurrency = Number(process.argv[3] ?? 20);
const total = Number(process.argv[4] ?? 100);

const lambda = new LambdaClient({
  region: "me-central-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const payload = new TextEncoder().encode(JSON.stringify({ rawPath: "/checkout" }));
const statuses = new Map<number, number>();
let next = 0;

async function worker(): Promise<void> {
  while (next < total) {
    next += 1;
    const res = await lambda.send(new InvokeCommand({ FunctionName: fn, Payload: payload }));
    const code = res.StatusCode ?? 0;
    statuses.set(code, (statuses.get(code) ?? 0) + 1);
  }
}

console.log(`Sending ${total} requests, ${concurrency} at a time, to ${fn}`);
const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`done in ${seconds}s`, Object.fromEntries(statuses));
