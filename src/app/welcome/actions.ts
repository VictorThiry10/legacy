"use server";
import { redirect } from "next/navigation";
import { commissionerEmail, db } from "@/lib/supabase/server";
import { getMe, LEAGUE_SIZE } from "@/lib/league";

const back = (msg: string): never => redirect(`/welcome?error=${encodeURIComponent(msg)}`);

// A newly signed in person claims one of the league's spots.
export async function createTeam(f: FormData) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.team) redirect("/");
  const name = String(f.get("name") ?? "").trim().replace(/\s+/g, " ");
  const gm = String(f.get("gm") ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 30) back("Team name: 1 to 30 characters.");
  if (!gm || gm.length > 30) back("GM name: 1 to 30 characters.");
  const d = db();
  const { data: teams } = await d.from("teams").select("name");
  if ((teams ?? []).length >= LEAGUE_SIZE) back(`Sorry, the league is full (${LEAGUE_SIZE} teams).`);
  if ((teams ?? []).some((t) => t.name.toLowerCase() === name.toLowerCase())) back("That team name is taken.");
  const { error } = await d.from("teams").insert({ name, manager_name: gm, manager_email: me.email, is_commish: me.email === commissionerEmail() });
  if (error) back(error.message);
  redirect("/");
}
