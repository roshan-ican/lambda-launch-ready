import { describe, expect, it } from "vitest";
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { replay } from "./replay.js";

// A tiny in-memory SQS: two queues, and a log of every call in order.
function fakeSqs(dlq: { Body?: string; ReceiptHandle?: string }[]) {
  const main: string[] = [];
  const calls: string[] = [];
  const sqs = {
    async send(cmd: unknown) {
      if (cmd instanceof ReceiveMessageCommand) {
        calls.push("receive");
        return { Messages: dlq.slice(0, cmd.input.MaxNumberOfMessages ?? 1) };
      }
      if (cmd instanceof SendMessageCommand) {
        calls.push(`send ${cmd.input.MessageBody}`);
        main.push(cmd.input.MessageBody ?? "");
        return {};
      }
      if (cmd instanceof DeleteMessageCommand) {
        calls.push(`delete ${cmd.input.ReceiptHandle}`);
        const i = dlq.findIndex((m) => m.ReceiptHandle === cmd.input.ReceiptHandle);
        if (i >= 0) dlq.splice(i, 1);
        return {};
      }
      throw new Error("unexpected command");
    },
  } as unknown as SQSClient;
  return { sqs, main, calls };
}

describe("replay", () => {
  it("returns 0 and sends nothing when the DLQ is empty", async () => {
    const { sqs, main } = fakeSqs([]);
    expect(await replay(sqs, "dlq", "main")).toBe(0);
    expect(main).toEqual([]);
  });

  it("moves every message to the main queue and empties the DLQ", async () => {
    const dlq = [
      { Body: "a", ReceiptHandle: "r1" },
      { Body: "b", ReceiptHandle: "r2" },
    ];
    const { sqs, main } = fakeSqs(dlq);

    expect(await replay(sqs, "dlq", "main")).toBe(2);
    expect(main).toEqual(["a", "b"]);
    expect(dlq).toEqual([]);
  });

  it("sends a message before deleting it, so a crash can never lose it", async () => {
    const { sqs, calls } = fakeSqs([{ Body: "a", ReceiptHandle: "r1" }]);
    await replay(sqs, "dlq", "main");
    expect(calls.indexOf("send a")).toBeLessThan(calls.indexOf("delete r1"));
  });

  it("keeps receiving until the DLQ is empty (more than 10 messages)", async () => {
    const dlq = Array.from({ length: 23 }, (_, i) => ({ Body: `m${i}`, ReceiptHandle: `r${i}` }));
    const { sqs, main } = fakeSqs(dlq);
    expect(await replay(sqs, "dlq", "main")).toBe(23);
    expect(main).toHaveLength(23);
  });
});
