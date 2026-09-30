"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient, db } from "@/lib/supabase/server";
import { LEAGUE_SIZE } from "@/lib/league";

// The email waiting for its code lives in a short cookie, not the URL.
const EMAIL_COOKIE = "login_email";
const fail = (msg: string, step = ""): never => redirect(`/login?${step ? `step=${step}&` : ""}error=${encodeURIComponent(msg)}`);

// Step 1: email -> Supabase sends a sign in code. Anyone can join while the league has open spots.
export async function sendCode(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("That doesn't look like an email.");
  const d = db();
  const [{ data: team, error: dbError }, { count }] = await Promise.all([
    d.from("teams").select("id").ilike("manager_email", email).maybeSingle(),
    d.from("teams").select("id", { count: "exact", head: true }),
  ]);
  if (dbError) fail("Database problem: " + dbError.message);
  if (!team && (count ?? 0) >= LEAGUE_SIZE) fail(`The league is full (${LEAGUE_SIZE} teams).`);
  // The email carries a code (and a link, which works when opened in this same browser).
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await (await authClient()).auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` } });
  if (error) fail(/rate limit/i.test(error.message) ? "Too many sign ins right now. Try again in an hour." : error.message);
  (await cookies()).set(EMAIL_COOKIE, email, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 30, path: "/" });
  redirect("/login?step=code");
}

// Step 2: the code from the email signs them in. New people then pick a team name on /welcome.
export async function verifyCode(form: FormData) {
  const store = await cookies();
  const email = store.get(EMAIL_COOKIE)?.value ?? fail("That took too long. Enter your email again.");
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (token.length < 6) fail("Enter the code from the email.", "code");
  const { error } = await (await authClient()).auth.verifyOtp({ email, token, type: "email" });
  if (error) fail("That code didn't work. Check it, or send a new one.", "code");
  store.delete(EMAIL_COOKIE);
  redirect("/");
}

export async function startOver() {
  (await cookies()).delete(EMAIL_COOKIE);
  redirect("/login");
}
