// The fake payment provider. It runs on the Next.js server, never in the browser,
// because whoever holds WEBHOOK_SECRET can forge "payment succeeded".
import { createHmac, randomUUID } from "node:crypto";
import { env } from "./aws";

export function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function paymentBody(orderId: string, eventId = `evt_${randomUUID().slice(0, 8)}`) {
  return { eventId, body: JSON.stringify({ eventId, orderId, type: "payment.succeeded" }) };
}

// Send the same signed event `copies` times at once, like a provider retrying.
export async function sendWebhook(orderId: string, copies = 1) {
  const { eventId, body } = paymentBody(orderId);
  const signature = sign(body, env("WEBHOOK_SECRET"));

  const statuses = await Promise.all(
    Array.from({ length: copies }, async () => {
      const res = await fetch(env("WEBHOOK_URL"), {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature },
        body,
      });
      return res.status;
    }),
  );
  return { eventId, orderId, statuses };
}

export async function createOrder(amount: number) {
  const res = await fetch(env("ORDER_URL"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  return { status: res.status, data: (await res.json()) as { orderId?: string; error?: string } };
}
