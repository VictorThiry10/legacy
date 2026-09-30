import { NextResponse } from "next/server";
import { commissionerEmail, db } from "@/lib/supabase/server";

// Quick check page: is the site set up right? Shows no secrets, only yes/no answers.
export const dynamic = "force-dynamic";
export async function GET() {
  const env = (k: string) => !!process.env[k];
  const { error, count } = await db().from("teams").select("id", { count: "exact", head: true });
  return NextResponse.json({
    database: error ? `error: ${error.message}` : "ok",
    teams: count ?? null,
    commissionerEmailSet: !!commissionerEmail(),
    commissionerEmailLength: commissionerEmail().length,
    keys: {
      url: env("NEXT_PUBLIC_SUPABASE_URL"),
      publishable: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      secret: env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
}
