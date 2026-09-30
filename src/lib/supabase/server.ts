import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Supabase's Vercel link fills these in. Newer key names first, older ones as backup.
const ANON = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
const SERVICE = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!;

// The commissioner's email (Vercel setting if present, otherwise Victor), cleaned up.
export const commissionerEmail = () => (process.env.COMMISSIONER_EMAIL || "victortthiry@gmail.com").trim().toLowerCase();

// Knows who is logged in (reads the login cookie). Used only for auth.
export async function authClient() {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes cookies instead
        }
      },
    },
  });
}

// Full database access. Server only, never sent to the browser.
export function db() {
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}
