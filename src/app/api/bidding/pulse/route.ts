import { pulse } from "@/lib/bidding";

export const dynamic = "force-dynamic";

// Polled every couple of seconds by the bidding room: a fingerprint that changes whenever the room does.
// t1 (request in) and t2 (response out) let the screen work out how far its clock is from ours, NTP style.
export async function GET() {
  const t1 = Date.now();
  const v = await pulse();
  return Response.json({ v, t1, t2: Date.now() }, { headers: { "cache-control": "no-store" } });
}
