import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every page: keeps the login fresh and sends logged out visitors to /login.
export async function proxy(request: NextRequest) {
  const test = !!process.env.LOCAL_TEST_EMAIL && (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("http://localhost");
  // The bidding site has its own email sign in (lib/bidding.ts) and never requires the league login. The league
  // login only matters there for the commissioner's controls, so it's kept fresh when present (not on the 2 s poll).
  const path = request.nextUrl.pathname;
  const bidding = path.startsWith("/bidding");
  const leagueLogin = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (test || path.startsWith("/api/bidding") || (bidding && !leagueLogin)) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  const open = path.startsWith("/login") || path.startsWith("/install") || path.startsWith("/auth") || path.startsWith("/api/cron") || path === "/api/health";
  if (!data.user && !open && !bidding) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
