import { db } from "@/lib/supabase/server";
import { money } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function Players({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const d = db();
  let query = d.from("players").select("*").order("rank", { ascending: true, nullsFirst: false }).order("name").limit(100);
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data: players }, { data: owned }] = await Promise.all([
    query,
    d.from("contracts").select("player_id, salary, team:teams(name)").eq("active", true),
  ]);
  const ids = (players ?? []).map((p) => p.id);
  const { data: logs } = ids.length
    ? await d.from("player_games").select("player_id, fpts, played, game:games(start)").in("player_id", ids).eq("played", true)
    : { data: [] as { player_id: string; fpts: number; game: { start: string } }[] };
  const fp = new Map<string, { avg: number; last: number; gp: number }>();
  for (const id of ids) {
    const mine = ((logs ?? []) as unknown as { player_id: string; fpts: number; game: { start: string } }[])
      .filter((l) => l.player_id === id)
      .sort((a, b) => b.game.start.localeCompare(a.game.start));
    if (mine.length) fp.set(id, { avg: mine.reduce((a, l) => a + Number(l.fpts), 0) / mine.length, last: Number(mine[0].fpts), gp: mine.length });
  }
  const owner = new Map((owned ?? []).map((o) => [o.player_id, o as unknown as { salary: number; team: { name: string } }]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Players</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search players" className="input" />
        <button className="btn">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="t">
          <thead><tr><th>Player</th><th>Pos</th><th className="text-right">Avg FP</th><th className="text-right hidden sm:table-cell">Last</th><th>Status</th><th>Owner</th></tr></thead>
          <tbody>
            {(players ?? []).map((p) => {
              const o = owner.get(p.id);
              return (
                <tr key={p.id}>
                  <td>{p.name} <span className="text-xs text-muted">{p.nba_team}</span></td>
                  <td>{p.position}</td>
                  <td className="num text-right">{fp.get(p.id) ? fp.get(p.id)!.avg.toFixed(1) : <span className="text-muted">–</span>}</td>
                  <td className="num text-right text-muted hidden sm:table-cell">{fp.get(p.id)?.last.toFixed(1) ?? "–"}</td>
                  <td className="text-xs">{p.injury_status ? <span className="text-bad" title={p.injury_note ?? ""}>{p.injury_status}</span> : <span className="text-muted">Healthy</span>}</td>
                  <td className="text-xs">{o ? `${o.team.name} · ${money(Number(o.salary))}` : <span className="text-muted">Free agent</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!players?.length && <p className="text-muted text-sm p-2">No players loaded yet. The commissioner loads them from ESPN.</p>}
      </div>
    </div>
  );
}
