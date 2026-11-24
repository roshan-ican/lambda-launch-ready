import { sendWebhook } from "@/lib/provider";

// Plays the payment provider: ONE eventId, sent `copies` times (a retrying provider).
export async function POST(request: Request) {
  const { orderId, copies = 1 } = await request.json();
  if (typeof orderId !== "string") return Response.json({ error: "orderId required" }, { status: 400 });
  const n = Math.min(Math.max(Number(copies) || 1, 1), 10);
  return Response.json(await sendWebhook(orderId, n));
}
