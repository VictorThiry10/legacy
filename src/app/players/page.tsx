import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getSettings, type Player } from "@/lib/league";
import { leagueNews } from "@/lib/espn";
import { STAT_COLS, fmt, seasonLabel, stat, type StatKey } from "@/lib/player-stats";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

export default async function Players({ searchParams }: PageProps<"/players">) {
  const raw = await searchParams;
  const sp: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  const tab = sp.tab === "news" ? "news" : "stats";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Players</h1>
      <div className="flex gap-6 border-b border-line text-sm">
        <Tab href={href(sp, { tab: undefined })} on={tab === "stats"}>Stats</Tab>
        <Tab href={href(sp, { tab: "news" })} on={tab === "news"}>News</Tab>
      </div>
      {tab === "news" ? <News /> : <StatsTable sp={sp} />}
    </div>
  );
}

function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`pb-2 -mb-px border-b-2 ${on ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg"}`}>
      {children}
    </Link>
  );
}

// Keeps the current filters and changes only what's passed in.
function href(sp: Params, change: Params) {
  const next = { ...sp, ...change };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
  return qs ? `/players?${qs}` : "/players";
}

async function StatsTable({ sp }: { sp: Params }) {
  const perGame = sp.view !== "tot";
  const sort = (sp.sort ?? "avg") as StatKey;
  const asc = sp.dir === "asc";
  const show = sp.show ?? "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const d = db();
  const { season } = await getSettings();

  const [{ data: rows }, { data: owned }, { data: games }] = await Promise.all([
    d.from("players").select("id, name, position, nba_team, nba_team_id, headshot, injury_status, injury_note, last_season").limit(2000),
    d.from("contracts").select("player_id, team:teams(id, name)").eq("active", true),
    d.from("games").select("id, start, home_team_id, away_team_id").gte("start", threeHoursAgo()).neq("state", "post").order("start").limit(200),
  ]);
  const players = (rows ?? []) as Player[];
  const owner = new Map(((owned ?? []) as unknown as { player_id: string; team: { id: string; name: string } }[]).map((o) => [o.player_id, o.team]));
  const abbr = new Map(players.filter((p) => p.nba_team_id).map((p) => [p.nba_team_id!, p.nba_team ?? ""]));
  const nextGame = new Map<string, { start: string; opp: string }>();
  for (const g of games ?? []) {
    if (!nextGame.has(g.home_team_id)) nextGame.set(g.home_team_id, { start: g.start, opp: abbr.get(g.away_team_id) ?? "?" });
    if (!nextGame.has(g.away_team_id)) nextGame.set(g.away_team_id, { start: g.start, opp: "@" + (abbr.get(g.home_team_id) ?? "?") });
  }

  const list = players
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .filter((p) => !sp.pos || fits(p.position, sp.pos))
    .filter((p) => (show === "fa" ? !owner.has(p.id) : show === "owned" ? owner.has(p.id) : true))
    .map((p) => ({ p, v: stat(p.last_season, sort, perGame) }))
    .sort((a, b) => (a.v == null ? 1 : b.v == null ? -1 : asc ? a.v - b.v : b.v - a.v) || a.p.name.localeCompare(b.p.name));
  const shown = sp.all ? list : list.slice(0, 100);
  const lastYear = players.find((p) => p.last_season?.season)?.last_season?.season ?? season;

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <form className="flex gap-2 w-full sm:w-auto">
          {Object.entries(sp).filter(([k, v]) => v && k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search players" className="input sm:w-64" />
          <button className="btn">Search</button>
        </form>
        <div className="flex flex-wrap gap-2 text-sm">
          <Pills sp={sp} name="show" value={show} options={[["all", "All"], ["fa", "Free agents"], ["owned", "Rostered"]]} />
          <Pills sp={sp} name="pos" value={sp.pos ?? ""} options={[["", "All pos"], ...POSITIONS.map((p) => [p, p] as [string, string])]} />
          <Pills sp={sp} name="view" value={perGame ? "" : "tot"} options={[["", "Averages"], ["tot", "Totals"]]} />
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="t players whitespace-nowrap">
          <thead>
            <tr className="group">
              <th colSpan={2} className="text-center">Players</th>
              <th colSpan={2} className="text-center border-l border-line">Next game</th>
              <th colSpan={STAT_COLS.length} className="text-center border-l border-line">{seasonLabel(lastYear)} stats</th>
              <th colSpan={2} className="text-center border-l border-line">Fantasy pts</th>
            </tr>
            <tr>
              <th className="sticky left-0 bg-card">Player</th>
              <th>Type</th>
              <th className="border-l border-line">Opp</th>
              <th>Time</th>
              {STAT_COLS.map((c, i) => (
                <SortTh key={c.key} sp={sp} sort={sort} asc={asc} k={c.key} label={c.label} title={c.title} className={i === 0 ? "border-l border-line" : ""} />
              ))}
              <SortTh sp={sp} sort={sort} asc={asc} k="tot" label="TOT" title="Fantasy points, whole season" className="border-l border-line" />
              <SortTh sp={sp} sort={sort} asc={asc} k="avg" label="AVG" title="Fantasy points per game" />
            </tr>
          </thead>
          <tbody>
            {shown.map(({ p }) => {
              const ls = p.last_season;
              const o = owner.get(p.id);
              const g = p.nba_team_id ? nextGame.get(p.nba_team_id) : undefined;
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 bg-card">
                    <Link href={`/players/${p.id}`} className="flex items-center gap-3 group">
                      {p.headshot ? <img src={p.headshot} alt="" className="h-9 w-9 rounded-full object-cover bg-line shrink-0" /> : <span className="h-9 w-9 rounded-full bg-line shrink-0" />}
                      <span>
                        <span className="text-accent group-hover:underline">{p.name}</span>
                        {p.injury_status && <span className="ml-2 text-[10px] font-semibold uppercase text-bad" title={p.injury_note ?? ""}>{p.injury_status}</span>}
                        <span className="block text-xs text-muted">{p.nba_team} · {p.position}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-xs">{o ? <Link href={`/teams/${o.id}`} className="hover:underline">{o.name}</Link> : <span className="text-muted">FA</span>}</td>
                  <td className="border-l border-line text-accent">{g?.opp ?? <span className="text-muted">–</span>}</td>
                  <td className="text-xs text-muted">{g ? <><LocalTime iso={g.start} mode="day" /> <LocalTime iso={g.start} /></> : "–"}</td>
                  {STAT_COLS.map((c, i) => (
                    <td key={c.key} className={`num text-right ${i === 0 ? "border-l border-line" : ""}`}>{fmt(stat(ls, c.key, perGame && c.key !== "gp"), perGame, c.key)}</td>
                  ))}
                  <td className="num text-right border-l border-line">{fmt(stat(ls, "tot", false), false, "tot")}</td>
                  <td className="num text-right font-semibold">{fmt(stat(ls, "avg", false), false, "avg")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!players.length && <p className="text-muted text-sm p-4">No players loaded yet. The commissioner loads them from ESPN.</p>}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>{shown.length} of {list.length} players. Fantasy points leave out the +1 win bonus (ESPN doesn&apos;t say which games a player&apos;s team won).</span>
        {!sp.all && list.length > shown.length && <Link href={href(sp, { all: "1" })} className="text-accent hover:underline">Show all</Link>}
      </div>
    </>
  );
}

// "SG, SF" fits SG and SF. Players with only a basic ESPN position ("G") fit PG and SG.
const fits = (position: string | null, pos: string) => {
  const list = (position ?? "").split(/,\s*/);
  return list.includes(pos) || list.includes(pos.slice(-1));
};

const threeHoursAgo = () => new Date(Date.now() - 3 * 3600_000).toISOString();

// A column header that sorts the table (click again to flip the order).
function SortTh({ sp, sort, asc, k, label, title, className = "" }: { sp: Params; sort: StatKey; asc: boolean; k: StatKey; label: string; title?: string; className?: string }) {
  const on = sort === k;
  return (
    <th className={`text-right ${className}`} title={title}>
      <Link href={href(sp, { sort: k, dir: on && !asc ? "asc" : undefined })} className={`underline-offset-4 hover:underline ${on ? "text-fg" : ""}`}>
        {label}{on ? (asc ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

function Pills({ sp, name, value, options }: { sp: Params; name: string; value: string; options: [string, string][] }) {
  return (
    <div className="flex rounded-lg border border-line overflow-hidden">
      {options.map(([v, label]) => (
        <Link key={v} href={href(sp, { [name]: v || undefined })} className={`px-3 py-1.5 ${value === v ? "bg-fg text-bg" : "hover:bg-line"}`}>
          {label}
        </Link>
      ))}
    </div>
  );
}

async function News() {
  const [items, { data: players }] = await Promise.all([leagueNews(), db().from("players").select("id, name")]);
  const names = new Map((players ?? []).map((p) => [p.id as string, p.name as string]));
  if (!items.length) return <p className="card text-muted text-sm">No news right now. ESPN may be unreachable; try again in a minute.</p>;
  return (
    <div className="space-y-3">
      {items.map((n, i) => (
        <div key={i} className="card flex gap-4">
          {n.image && <img src={n.image} alt="" className="hidden sm:block h-20 w-32 rounded-lg object-cover bg-line shrink-0" />}
          <div className="min-w-0 space-y-1">
            <a href={n.url ?? "#"} target="_blank" rel="noreferrer" className="font-medium hover:underline">{n.headline}</a>
            {n.description && n.description !== n.headline && <p className="text-sm text-muted">{n.description}</p>}
            <div className="flex flex-wrap gap-2 items-center text-xs text-muted">
              {n.published && <LocalTime iso={n.published} mode="day" />}
              {(n.athleteIds ?? []).filter((id) => names.has(id)).map((id) => (
                <Link key={id} href={`/players/${id}`} className="rounded-full border border-line px-2 py-0.5 text-fg hover:bg-line">{names.get(id)}</Link>
              ))}
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">Headlines from ESPN.</p>
    </div>
  );
}
