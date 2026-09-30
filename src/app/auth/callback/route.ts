import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supa = await authClient();
    await supa.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(new URL("/", request.url));
  }
  // Links from linkClient() carry the session after the # (never sent to the server): the browser keeps it
  // through this redirect and /auth/confirm finishes the sign in.
  return NextResponse.redirect(new URL("/auth/confirm", request.url));
}
