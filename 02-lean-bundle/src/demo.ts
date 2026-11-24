import {
  InvokeCommand,
  LambdaClient,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";

const fn = process.argv[2] ?? "lean-bundle";
const burst = Number(process.argv[3] ?? 50);

const lambda = new LambdaClient({
  region: "me-central-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

interface Result {
  coldStart: boolean;
  initMs: number;
  lambdaInitMs: number | null;
  waitedMs: number;
}

async function resetEnvironments(): Promise<void> {
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: fn,
      Environment: { Variables: { DEMO_RUN: String(Date.now()) } },
    }),
  );
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: fn });
}

async function invoke(rawPath: string): Promise<Result> {
  const started = performance.now();
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: fn,
      LogType: "Tail",
      Payload: new TextEncoder().encode(JSON.stringify({ rawPath })),
    }),
  );
  const waitedMs = Math.round(performance.now() - started);
  const tail = res.LogResult ? Buffer.from(res.LogResult, "base64").toString("utf8") : "";
  const line = tail.split("\n").find((l) => l.includes("request_done")) ?? "";
  const parsed = line ? JSON.parse(line.slice(line.indexOf("{"))) : { coldStart: false, initMs: 0 };
  const init = /Init Duration: ([\d.]+) ms/.exec(tail);
  return {
    coldStart: Boolean(parsed.coldStart),
    initMs: Number(parsed.initMs ?? 0),
    lambdaInitMs: init?.[1] ? Number(init[1]) : null,
    waitedMs,
  };
}

function describe(label: string, r: Result): void {
  const kind = r.coldStart ? "COLD" : "warm";
  const init = r.coldStart ? `init ${r.initMs} ms (Lambda says ${r.lambdaInitMs ?? "n/a"} ms)` : "no init";
  console.log(`${label.padEnd(28)} ${kind}  ${init}  customer waited ${r.waitedMs} ms`);
}

console.log(`Resetting ${fn} so every environment is fresh...`);
await resetEnvironments();

console.log("\nStep 1: first customer, no environment exists yet");
describe("  request 1 (/checkout)", await invoke("/checkout"));

console.log("\nStep 2: second customer, environment 1 is free again");
describe("  request 2 (/checkout)", await invoke("/checkout"));

console.log(`\nStep 3: ${burst} customers arrive at the same moment`);
const results = await Promise.all(Array.from({ length: burst }, () => invoke("/checkout")));
const cold = results.filter((r) => r.coldStart);
const warm = results.length - cold.length;
const waits = results.map((r) => r.waitedMs).sort((a, b) => a - b);
const inits = cold.map((r) => r.initMs).sort((a, b) => a - b);
console.log(`  ${cold.length} cold (new environments started), ${warm} warm (reused)`);
if (inits.length) {
  console.log(`  cold init ms: fastest ${inits[0]}, slowest ${inits[inits.length - 1]}`);
}
console.log(`  customer wait ms: fastest ${waits[0]}, slowest ${waits[waits.length - 1]}`);
console.log("\nLocal LocalStack timings, not AWS-representative.");
