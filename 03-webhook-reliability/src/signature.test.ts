import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./signature.js";

const secret = "whsec_test";
const body = JSON.stringify({ eventId: "evt_1", orderId: "ord_1", type: "payment.succeeded" });

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

describe("verifySignature", () => {
  it("accepts a signature made with the right secret", () => {
    expect(verifySignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifySignature(body, sign(body, "attacker"), secret)).toBe(false);
  });

  it("rejects a body changed after signing", () => {
    const tampered = body.replace("ord_1", "ord_999");
    expect(verifySignature(tampered, sign(body, secret), secret)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifySignature(body, "abc123", secret)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });
});
