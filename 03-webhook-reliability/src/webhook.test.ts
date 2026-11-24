import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const { sendSpy } = vi.hoisted(() => ({
  sendSpy: vi.fn(async (_command: { input: unknown }) => ({ MessageId: "m-1" })),
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = sendSpy;
  },
  SendMessageCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { handler } from "./webhook.js";

const SECRET = "whsec_test";
const QUEUE_URL = "http://localhost:4566/000000000000/payments";
const body = JSON.stringify({ eventId: "evt_1", orderId: "ord_1", type: "payment.succeeded" });

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

function eventWith(rawBody: string, signature?: string, isBase64Encoded = false): APIGatewayProxyEventV2 {
  return {
    body: rawBody,
    isBase64Encoded,
    headers: signature === undefined ? {} : { "x-signature": signature },
  } as unknown as APIGatewayProxyEventV2;
}

describe("webhook handler", () => {
  beforeEach(() => {
    sendSpy.mockClear();
    process.env.WEBHOOK_SECRET = SECRET;
    process.env.QUEUE_URL = QUEUE_URL;
  });

  it("queues a correctly signed webhook and returns 200", async () => {
    const res = await handler(eventWith(body, sign(body)));

    expect(res).toMatchObject({ statusCode: 200 });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]?.[0].input).toEqual({ QueueUrl: QUEUE_URL, MessageBody: body });
  });

  it("rejects a bad signature with 401 and queues nothing", async () => {
    const res = await handler(eventWith(body, "0".repeat(64)));

    expect(res).toMatchObject({ statusCode: 401 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    const res = await handler(eventWith(body));

    expect(res).toMatchObject({ statusCode: 401 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects a signed body without eventId with 400", async () => {
    const noId = JSON.stringify({ orderId: "ord_1" });
    const res = await handler(eventWith(noId, sign(noId)));

    expect(res).toMatchObject({ statusCode: 400 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects a signed body that is not JSON with 400", async () => {
    const notJson = "hello";
    const res = await handler(eventWith(notJson, sign(notJson)));

    expect(res).toMatchObject({ statusCode: 400 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("decodes a base64 body before checking the signature", async () => {
    const encoded = Buffer.from(body).toString("base64");
    const res = await handler(eventWith(encoded, sign(body), true));

    expect(res).toMatchObject({ statusCode: 200 });
    expect(sendSpy.mock.calls[0]?.[0].input).toEqual({ QueueUrl: QUEUE_URL, MessageBody: body });
  });
});
