import { NextResponse } from "next/server";
import { autoRefresh } from "@/lib/espn";

// Called every 10 minutes by a timer in Supabase (and once a day by Vercel as a backup).
// No password needed: it only re-reads public ESPN data, and it refuses to run twice within 4 minutes.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(await autoRefresh());
}
