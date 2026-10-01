import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getSettings, type Player } from "@/lib/league";
import { STAT_COLS, fmt, seasonLabel, stat, type StatKey } from "@/lib/player-stats";
import LocalTime from "@/components/LocalTime";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

export default async function Players({ searchParams }: PageProps<"/players">) {
  const raw = await searchParams;
  const sp: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Players</h1>
      <StatsTable sp={sp} />
    </div>
  );
}

// Keeps the current filters and changes only what's passed in.
function href(sp: Params, change: Params) {
  const next = { ...sp, ...change };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
  return qs ? `/players?${qs}` : "/players";
}

// Fantasy team shown as initials: "Brunson Bhenchodes" -> BB, one-word names -> first 3 letters.
const initials = (name: string) => {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 4) : name.slice(0, 3)).toUpperCase();
};

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
      <FilterBar sp={sp} show={show} perGame={perGame} />

      <div className="card p-0 overflow-x-auto">
        <table className="t players whitespace-nowrap">
          <thead>
            <tr className="group">
              <th colSpan={3} className="text-center">Players</th>
              <th colSpan={2} className="text-center border-l border-line">Next game</th>
              <th colSpan={STAT_COLS.length} className="text-center border-l border-line">{seasonLabel(lastYear)} stats</th>
              <th colSpan={2} className="text-center border-l border-line">Fantasy pts</th>
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-card w-12" aria-label="Photo" />
              <th>Player</th>
              <th>Team</th>
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
                  <td className="sticky left-0 z-10 bg-card pr-0">
                    <Link href={`/players/${p.id}`} aria-label={p.name}>
                      {p.headshot ? <img src={p.headshot} alt="" className="h-9 w-9 rounded-full object-cover bg-line" /> : <span className="block h-9 w-9 rounded-full bg-line" />}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/players/${p.id}`} className="group">
                      <span className="text-accent group-hover:underline">{p.name}</span>
                      {p.injury_status && <span className="ml-2 text-[10px] font-semibold uppercase text-bad" title={p.injury_note ?? ""}>{p.injury_status}</span>}
                      <span className="block text-xs text-muted">{p.nba_team} · {p.position}</span>
                    </Link>
                  </td>
                  <td className="text-xs font-semibold">{o ? <Link href={`/teams/${o.id}`} title={o.name} className="hover:underline">{initials(o.name)}</Link> : <span className="text-muted font-normal">FA</span>}</td>
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

const pill = "h-10 min-w-12 px-4 inline-flex items-center justify-center rounded-full text-sm font-semibold whitespace-nowrap";
const chip = (on: boolean) => `${pill} ${on ? "border-2 border-fg text-fg bg-card" : "bg-line/70 text-muted hover:text-fg"}`;

// ESPN style filter row: search and filter buttons, then position chips. Search opens a full width box instead.
function FilterBar({ sp, show, perGame }: { sp: Params; show: string; perGame: boolean }) {
  const filtered = show !== "all" || !perGame;
  if (sp.search || sp.q) {
    const keep = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "q" && k !== "search")) as Record<string, string>;
    return <SearchBar path="/players" params={keep} initial={sp.q ?? ""} cancelHref={href(sp, { q: undefined, search: undefined })} />;
  }
  return (
    // Dropdowns are placed against the outer box, so the sideways-scrolling chip row doesn't clip them.
    <div className="relative">
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
      <Link href={href(sp, { search: "1" })} className={`${chip(false)} shrink-0`} aria-label="Search"><SearchIcon /></Link>
      <details className="shrink-0">
        <summary className={`${chip(filtered)} list-none cursor-pointer`} aria-label="Filters"><FilterIcon /></summary>
        <div className="absolute left-0 top-full z-20 mt-1 card p-3 shadow-lg space-y-3 text-sm">
          <Options sp={sp} name="show" value={show} options={[["all", "All players"], ["fa", "Free agents"], ["owned", "Rostered"]]} />
          <Options sp={sp} name="view" value={perGame ? "" : "tot"} options={[["", "Averages"], ["tot", "Totals"]]} />
        </div>
      </details>
      <span className="h-8 w-px bg-line shrink-0 mx-1" />
      {[["", "All"], ...POSITIONS.map((p) => [p, p])].map(([v, label]) => (
        <Link key={label} href={href(sp, { pos: v || undefined })} className={`${chip((sp.pos ?? "") === v)} shrink-0`}>{label}</Link>
      ))}
    </div>
    </div>
  );
}

function Options({ sp, name, value, options }: { sp: Params; name: string; value: string; options: [string, string][] }) {
  return (
    <div className="flex gap-2">
      {options.map(([v, label]) => (
        <Link key={v} href={href(sp, { [name]: v || undefined })} className={`${chip(value === v)} h-9 text-xs`}>{label}</Link>
      ))}
    </div>
  );
}

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const FilterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
);
