import { NextResponse } from "next/server";
import { advance } from "@/lib/bidding";

// Called every minute by a timer in Supabase (bidding-tick): opens the day's free agency round and signs the
// winners once the renounce window is over, on time, with nobody on the site. No password needed: it only does
// what the schedule says is due, and doing it twice changes nothing.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await advance();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
