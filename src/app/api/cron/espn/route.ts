import { NextResponse } from "next/server";
import { autoRefresh } from "@/lib/espn";
import { settleWaivers } from "@/lib/waivers";
import { checkScoresFresh } from "@/lib/health";

// Called every 2 minutes by a timer in Supabase (and once a day by Vercel as a backup).
// No password needed: it only re-reads public ESPN data and settles waivers whose time is up,
// and the ESPN part keeps its own rhythm (lib/espn.ts autoRefresh) however often it is called.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const fresh = await checkScoresFresh().catch(() => null); // before updating: raises an outage the timers missed
  const waivers = await settleWaivers().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  return NextResponse.json({ fresh, waivers, ...(await autoRefresh()) });
}
