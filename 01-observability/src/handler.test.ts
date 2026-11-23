import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "./handler.js";

const event = { rawPath: "/status" } as APIGatewayProxyEventV2;

function loggedLines(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])));
}

describe("handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs coldStart true then false with timing fields", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const first = await handler(event);
    await handler(event);

    const [cold, warm] = loggedLines(log);
    expect(first).toEqual({ statusCode: 200, body: JSON.stringify({ status: "ok", path: "/status" }) });
    expect(cold).toMatchObject({ msg: "request_done", coldStart: true });
    expect(cold.initMs).toBeGreaterThan(0);
    expect(warm).toMatchObject({ coldStart: false, initMs: 0 });
    expect(typeof warm.handlerMs).toBe("number");
  });
});
