import { createOrder } from "@/lib/provider";

// Browser → here → create-order Lambda. Amount is in fils (4999 = 49.99 AED).
export async function POST(request: Request) {
  const { amount } = await request.json();
  const { status, data } = await createOrder(amount);
  return Response.json(data, { status });
}
