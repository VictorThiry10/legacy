import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";

// When the scores last updated (sync_log.scores), as plain text. The Matchup page polls this every minute while
// games are on and only reloads itself when it changes (components/AutoRefresh.tsx): one tiny query instead of a
// full page render per GM per minute.
export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await db().from("sync_log").select("last_run").eq("name", "scores").maybeSingle();
  return new NextResponse(data?.last_run ?? "", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
