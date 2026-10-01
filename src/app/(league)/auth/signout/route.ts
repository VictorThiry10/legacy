import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supa = await authClient();
  await supa.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
