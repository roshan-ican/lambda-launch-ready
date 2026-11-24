import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "./handler.js";
import { getDynamoDb, getS3 } from "./clients.js";

function eventFor(rawPath: string) {
  return { rawPath } as APIGatewayProxyEventV2;
}

function loggedLines(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])));
}

describe("lazy handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs coldStart true then false with timing fields", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const first = await handler(eventFor("/checkout"));
    await handler(eventFor("/checkout"));

    const [cold, warm] = loggedLines(log);
    expect(first).toEqual({ statusCode: 200, body: JSON.stringify({ status: "ok", path: "/checkout" }) });
    expect(cold).toMatchObject({ msg: "request_done", coldStart: true });
    expect(cold.initMs).toBeGreaterThan(0);
    expect(warm).toMatchObject({ coldStart: false, initMs: 0 });
    expect(typeof warm.handlerMs).toBe("number");
  });

  it("answers /receipt and /order with their path", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const receipt = await handler(eventFor("/receipt"));
    const order = await handler(eventFor("/order"));

    expect(receipt).toEqual({ statusCode: 200, body: JSON.stringify({ status: "ok", path: "/receipt" }) });
    expect(order).toEqual({ statusCode: 200, body: JSON.stringify({ status: "ok", path: "/order" }) });
  });
});

describe("lazy clients", () => {
  it("creates each client once and reuses it", async () => {
    expect(await getS3()).toBe(await getS3());
    expect(await getDynamoDb()).toBe(await getDynamoDb());
  });
});
