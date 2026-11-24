import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const { sendSpy } = vi.hoisted(() => ({
  sendSpy: vi.fn(async (_command: { input: any }) => ({})),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = sendSpy;
  },
  PutItemCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { handler } from "./create-order.js";

function post(body: string, isBase64Encoded = false): APIGatewayProxyEventV2 {
  return { body, isBase64Encoded, headers: {} } as unknown as APIGatewayProxyEventV2;
}

const parse = (res: unknown) => JSON.parse((res as { body: string }).body);

describe("create-order", () => {
  beforeEach(() => {
    sendSpy.mockClear();
    vi.stubEnv("ORDERS_TABLE", "orders");
  });

  it("creates a pending order and returns 201 with an ord_<uuid> id", async () => {
    const res = await handler(post(JSON.stringify({ amount: 4999 })));

    expect(res).toMatchObject({ statusCode: 201 });
    const body = parse(res);
    expect(body.status).toBe("pending");
    expect(body.orderId).toMatch(/^ord_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("writes the order to DynamoDB without overwriting an existing one", async () => {
    const res = await handler(post(JSON.stringify({ amount: 4999 })));
    const input = sendSpy.mock.calls[0]?.[0].input;

    expect(input.TableName).toBe("orders");
    expect(input.Item.orderId.S).toBe(parse(res).orderId);
    expect(input.Item.status.S).toBe("pending");
    expect(input.Item.amount.N).toBe("4999");
    expect(input.ConditionExpression).toBe("attribute_not_exists(orderId)");
  });

  it("gives every order a different id", async () => {
    const a = parse(await handler(post(JSON.stringify({ amount: 100 })))).orderId;
    const b = parse(await handler(post(JSON.stringify({ amount: 100 })))).orderId;
    expect(a).not.toBe(b);
  });

  it("reads a base64-encoded body (Function URLs may send one)", async () => {
    const b64 = Buffer.from(JSON.stringify({ amount: 4999 })).toString("base64");
    expect(await handler(post(b64, true))).toMatchObject({ statusCode: 201 });
  });

  it.each([
    ["not JSON", "nope"],
    ["missing amount", "{}"],
    ["amount as a string", '{"amount":"4999"}'],
    ["decimal amount", '{"amount":49.99}'],
    ["zero", '{"amount":0}'],
    ["negative", '{"amount":-5}'],
  ])("rejects %s with 400 and writes nothing", async (_name, body) => {
    expect(await handler(post(body))).toMatchObject({ statusCode: 400 });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
