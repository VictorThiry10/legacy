"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authClient, commissionerEmail, db } from "@/lib/supabase/server";

export async function sendLink(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  // Only people the commissioner added can get a link.
  const { data: team, error: dbError } = await db().from("teams").select("id").ilike("manager_email", email).maybeSingle();
  if (dbError) redirect("/login?error=" + encodeURIComponent("Database problem: " + dbError.message));
  if (!team && email !== commissionerEmail()) redirect("/login?error=" + encodeURIComponent("That email is not in the league yet."));
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supa = await authClient();
  const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/login?sent=1");
}
