import { getMe } from "@/lib/auth";
import { teamSummaries } from "@/lib/league";
import { picksOf } from "@/lib/picks";
import { initials } from "@/lib/names";
import { load } from "@/lib/guard";
import TeamAvatar from "@/components/TeamAvatar";
import { IntelPage } from "../ui";

export const dynamic = "force-dynamic";

// Intel: rookie draft picks, who holds what. A traded pick carries the initials of the team it came from.
export default async function DraftPicks() {
  const [me, teams, picks] = await Promise.all([getMe(), teamSummaries(), load(() => picksOf())]);
  const myId = me?.team?.id;
  if ("err" in picks) return <IntelPage title="Draft picks"><p className="px-4 py-4 text-sm text-bad">{picks.err}</p></IntelPage>;
  return (
    <IntelPage title="Draft picks">
      {teams.map((t) => {
        const held = picks.ok.filter((x) => x.team_id === t.id);
        return (
          <div key={t.id} className={`flex items-center gap-3 border-b border-line/60 px-4 py-2.5 ${t.id === myId ? "bg-blue/10" : ""}`}>
            <TeamAvatar name={t.name} size="sm" />
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {held.map((x) => {
                const own = x.original.id === t.id;
                return (
                  <span key={x.id} title={own ? `${x.year} pick` : `${x.year} pick, from ${x.original.name}`} className={`num rounded-full px-2 py-0.5 text-xs font-medium ${own ? "bg-line/70" : "border border-accent text-accent"}`}>
                    {x.year}{!own && ` · ${initials(x.original.name)}`}
                  </span>
                );
              })}
              {!held.length && <span className="text-xs text-muted">None</span>}
            </div>
          </div>
        );
      })}
    </IntelPage>
  );
}
