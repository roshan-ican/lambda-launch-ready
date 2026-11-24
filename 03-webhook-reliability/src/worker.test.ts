import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQSEvent, SQSRecord } from "aws-lambda";

const { sendSpy, CanceledError } = vi.hoisted(() => {
  class CanceledError extends Error {
    CancellationReasons: { Code: string }[];
    constructor(codes: string[]) {
      super("Transaction cancelled");
      this.name = "TransactionCanceledException";
      this.CancellationReasons = codes.map((Code) => ({ Code }));
    }
  }
  return {
    sendSpy: vi.fn(async (_command: { input: any }) => ({})),
    CanceledError,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = sendSpy;
  },
  TransactWriteItemsCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  TransactionCanceledException: CanceledError,
}));

import { handler } from "./worker.js";

function record(messageId: string, body: string): SQSRecord {
  return { messageId, body } as SQSRecord;
}

function eventOf(...records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

const paid = (eventId: string, orderId: string) =>
  JSON.stringify({ eventId, orderId, type: "payment.succeeded" });

describe("worker", () => {
  beforeEach(() => {
    sendSpy.mockReset();
    sendSpy.mockImplementation(async () => ({}));
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.EVENTS_TABLE = "processed-events";
    process.env.ORDERS_TABLE = "orders";
  });

  it("records the event and marks the order paid in one transaction", async () => {
    const res = await handler(eventOf(record("m1", paid("evt_1", "ord_1"))));

    expect(res).toEqual({ batchItemFailures: [] });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const items = sendSpy.mock.calls[0]?.[0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      Put: {
        TableName: "processed-events",
        Item: { eventId: { S: "evt_1" } },
        ConditionExpression: "attribute_not_exists(eventId)",
      },
    });
    expect(items[1]).toMatchObject({
      Update: {
        TableName: "orders",
        Key: { orderId: { S: "ord_1" } },
        UpdateExpression: "SET #s = :paid",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":paid": { S: "paid" } },
      },
    });
  });

  it("treats an already-processed event as success and does not retry it", async () => {
    sendSpy.mockImplementationOnce(async () => {
      throw new CanceledError(["ConditionalCheckFailed", "None"]);
    });

    const res = await handler(eventOf(record("m1", paid("evt_1", "ord_1"))));

    expect(res).toEqual({ batchItemFailures: [] });
  });

  it("reports a message as failed when DynamoDB errors for another reason", async () => {
    sendSpy.mockImplementationOnce(async () => {
      throw new Error("throttled");
    });

    const res = await handler(eventOf(record("m1", paid("evt_1", "ord_1"))));

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: "m1" }] });
  });

  it("reports a message with a broken body as failed without touching DynamoDB", async () => {
    const res = await handler(eventOf(record("m1", "not json")));

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: "m1" }] });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("only reports the failed message in a batch, not the whole batch", async () => {
    sendSpy
      .mockImplementationOnce(async () => ({}))
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      })
      .mockImplementationOnce(async () => ({}));

    const res = await handler(
      eventOf(
        record("m1", paid("evt_1", "ord_1")),
        record("m2", paid("evt_2", "ord_2")),
        record("m3", paid("evt_3", "ord_3")),
      ),
    );

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: "m2" }] });
    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  it("fails a fail_ order before writing anything when the bug is on", async () => {
    vi.stubEnv("SIMULATE_BUG", "true");
    const res = await handler(eventOf(record("m1", paid("evt_9", "fail_42"))));

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: "m1" }] });
    expect(sendSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("processes a fail_ order normally once the bug is fixed", async () => {
    vi.stubEnv("SIMULATE_BUG", "false");
    const res = await handler(eventOf(record("m1", paid("evt_9", "fail_42"))));

    expect(res).toEqual({ batchItemFailures: [] });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
