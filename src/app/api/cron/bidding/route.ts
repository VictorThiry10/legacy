import { NextResponse } from "next/server";
import { advance } from "@/lib/bidding";
import { settleWaivers } from "@/lib/waivers";

// Called every minute by a timer in Supabase (bidding-tick): opens the day's free agency round and signs the
// winners once the renounce window is over, and clears waivers at 8:00 London, on time, with nobody on the site.
// No password needed: it only does what the clock says is due, and doing it twice changes nothing.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await advance();
    const waivers = await settleWaivers();
    return NextResponse.json({ ok: true, waivers });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
