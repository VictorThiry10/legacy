import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { authClient, db } from "./supabase/server";
import type { Team } from "./league";

// Who is using the app right now? Their email, and their team if they have one. Checked once per page (cache).
export const getMe = cache(async (): Promise<{ email: string; team: Team | null } | null> => {
  const user = (await testUser()) ?? (await (await authClient()).auth.getUser()).data.user;
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const { data: team } = await db().from("teams").select("*").ilike("manager_email", email).maybeSingle();
  if (team && !team.user_id) await db().from("teams").update({ user_id: user.id }).eq("id", team.id);
  return { email, team: team ?? null };
});

// Local testing only: pretend to be someone without email login. Never active on a real deployment.
export function testMode() {
  return !!process.env.LOCAL_TEST_EMAIL && (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("http://localhost");
}
async function testUser() {
  if (!testMode()) return null;
  const { cookies } = await import("next/headers");
  const email = (await cookies()).get("test_as")?.value ?? process.env.LOCAL_TEST_EMAIL!;
  return { id: "00000000-0000-0000-0000-" + email.length.toString().padStart(12, "0"), email };
}

// For pages: signed out -> login; signed in without a team -> pick a team name first.
export async function myTeamOrWelcome() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.team) redirect("/welcome");
  return me.team;
}

// For actions.
export async function requireTeam() {
  const me = await getMe();
  if (!me?.team) throw new Error("You don't have a team yet.");
  return me.team;
}

export async function requireCommish() {
  const team = await requireTeam();
  if (!team.is_commish) throw new Error("Commissioner only.");
  return team;
}
