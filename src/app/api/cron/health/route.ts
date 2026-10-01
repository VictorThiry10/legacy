import { NextResponse } from "next/server";
import { checkScoresFresh } from "@/lib/health";

// Called every 30 minutes by a second Supabase timer: emails the commissioner if scores stopped updating.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await checkScoresFresh());
}
