import { NextResponse, type NextRequest } from "next/server";
import { syncPlayers, syncRecent } from "@/lib/espn";

// Called on a timer (every 10 minutes during games) to pull box scores; once a day it also refreshes rosters and injuries.
// Protected by CRON_SECRET so random visitors can't trigger it.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const players = request.nextUrl.searchParams.get("players") === "1" ? await syncPlayers() : undefined;
  const recent = await syncRecent();
  return NextResponse.json({ ok: true, players, ...recent });
}
