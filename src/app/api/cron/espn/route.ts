import { NextResponse, type NextRequest } from "next/server";
import { syncPlayers, syncRecent } from "@/lib/espn";

// Called on a timer to pull box scores; with ?players=1 it also refreshes rosters and injuries.
// If CRON_SECRET is set, callers must send it. If not, only Vercel's own daily timer is let in.
// Worst case someone else triggers it: it just re-reads public ESPN data.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const vercelTimer = (request.headers.get("user-agent") ?? "").startsWith("vercel-cron");
  const allowed = secret ? auth === `Bearer ${secret}` : vercelTimer;
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const players = request.nextUrl.searchParams.get("players") === "1" ? await syncPlayers() : undefined;
  const recent = await syncRecent();
  return NextResponse.json({ ok: true, players, ...recent });
}
