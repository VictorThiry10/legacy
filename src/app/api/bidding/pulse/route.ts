import { pulse } from "@/lib/bidding";

export const dynamic = "force-dynamic";

// Polled every couple of seconds by the bidding room: a fingerprint that changes whenever the room does.
export async function GET() {
  return Response.json({ v: await pulse(), now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
