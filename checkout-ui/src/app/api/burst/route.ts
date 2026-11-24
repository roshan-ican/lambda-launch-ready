import { createOrder, sendWebhook } from "@/lib/provider";

// n customers pay at the same moment: n orders, each paid once, all in parallel.
// This is what makes Lambda start many environments at once (cold starts).
export async function POST(request: Request) {
  const { n = 50 } = await request.json().catch(() => ({}));
  const count = Math.min(Math.max(Number(n) || 50, 1), 100);

  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: count }, async () => {
      const order = await createOrder(4999);
      if (!order.data.orderId) return { ok: false };
      const paid = await sendWebhook(order.data.orderId, 1);
      return { ok: paid.statuses.every((s) => s === 200) };
    }),
  );
  return Response.json({
    sent: count,
    accepted: results.filter((r) => r.ok).length,
    ms: Date.now() - started,
  });
}
