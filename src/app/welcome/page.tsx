import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { getMe, LEAGUE_SIZE } from "@/lib/league";
import { createTeam } from "./actions";

export const dynamic = "force-dynamic";

// First sign in: pick a team name and GM name.
export default async function Welcome({ searchParams }: PageProps<"/welcome">) {
  const [me, sp, { count }] = await Promise.all([getMe(), searchParams, db().from("teams").select("id", { count: "exact", head: true })]);
  if (!me) redirect("/login");
  if (me.team) redirect("/");
  const taken = count ?? 0;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="text-2xl font-semibold">Welcome to the league</h1>
      {taken >= LEAGUE_SIZE ? (
        <p className="card mt-6 text-sm">Sorry, all {LEAGUE_SIZE} teams are taken.</p>
      ) : (
        <>
          <p className="text-muted mt-1 text-sm">{LEAGUE_SIZE - taken} of {LEAGUE_SIZE} spots left. Name your team to take one.</p>
          <form action={createTeam} className="mt-6 space-y-3">
            <label className="block">
              <span className="label">Team name</span>
              <input name="name" required maxLength={30} className="input mt-1" autoFocus />
            </label>
            <label className="block">
              <span className="label">GM name</span>
              <input name="gm" required maxLength={30} placeholder="Your name" className="input mt-1" />
            </label>
            <button className="btn w-full">Create my team</button>
            {error && <p className="text-bad text-sm">{error}</p>}
          </form>
        </>
      )}
      <form action="/auth/signout" method="post" className="mt-6 text-center">
        <button className="text-xs text-muted hover:text-fg">Sign out ({me.email})</button>
      </form>
    </div>
  );
}
