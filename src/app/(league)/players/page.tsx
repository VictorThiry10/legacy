import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getSettings, type Player } from "@/lib/league";
import { STAT_COLS, fmt, seasonLabel, stat, type StatKey } from "@/lib/player-stats";
import LocalTime from "@/components/LocalTime";
import SearchBar from "@/components/SearchBar";
import PlayerFilters from "@/components/PlayerFilters";
import { getMe } from "@/lib/auth";
import { gamesBetween, regularSeasonStarted } from "@/lib/nba";
import { rpc } from "@/lib/db";
import type { SeasonLine } from "@/lib/espn-parse";
import { NBA_TEAMS } from "@/lib/nba-teams";
import { addDays, isDay, monthDay, today, weekday } from "@/lib/dates";
import Slide from "@/components/Slide";
import { headshot, initials } from "@/lib/names";
import { openWaivers } from "@/lib/waivers";
import { watchlist } from "@/lib/watchlist";
import FlagIcon from "@/components/FlagIcon";
import ScrollBox from "@/components/ScrollBox";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;
// Which stat line the table shows: last season (the default), ESPN's projection, this season so far, or the last
// 7, 14 or 30 days. The last three come from our own box scores, added up by the player_totals database function.
const PERIODS = ["last", "proj", "season", "7", "14", "30"] as const;
type Period = (typeof PERIODS)[number];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

export default async function Players({ searchParams }: PageProps<"/players">) {
  const raw = await searchParams;
  const sp: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  return (
    <Slide>
      {/* Exactly as tall as the screen under the tab bar (2.75rem) and the page's top padding: the page stays put
          and the table scrolls in its own box, under its header rows. -mb-6 takes the page's bottom padding. */}
      <div className="-mb-6 flex h-[calc(100dvh-4.25rem-1px)] flex-col gap-4">
        <h1 className="text-2xl font-semibold">Players</h1>
        <StatsTable sp={sp} />
      </div>
    </Slide>
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
  const q = (sp.q ?? "").trim().toLowerCase();
  const watch = sp.watch === "1"; // only my watch list (the flag chip)
  // Who's listed: the players nobody has, unless the filter says otherwise. A search by name and my watch list look
  // at everyone.
  const show = sp.show ?? (q || watch ? "all" : "av");
  const play = isDay(sp.play) ? sp.play : ""; // only players whose NBA team plays that day
  const period: Period = PERIODS.includes(sp.stats as Period) ? (sp.stats as Period) : "last";
  const d = db();
  const { season } = await getSettings();

  const ours = period === "season" || period === "7" || period === "14" || period === "30";
  const [{ data: rows }, { data: owned }, { data: games }, waivers, me, watched, playing, totals] = await Promise.all([
    d.from("players").select("id, name, position, nba_team, nba_team_id, headshot, injury_status, injury_note, last_season, projection").limit(2000),
    d.from("contracts").select("player_id, team:teams(id, name)").eq("active", true),
    d.from("games").select("id, start, home_team_id, away_team_id").gte("start", threeHoursAgo()).neq("state", "post").order("start").limit(200),
    openWaivers(),
    getMe(),
    watch ? getMe().then((m) => (m?.team ? watchlist(m.team.id) : new Set<string>())) : null,
    play ? gamesBetween(play, play).then((gs) => new Set(gs.flatMap((g) => [g.home_team_id, g.away_team_id]))) : null,
    ours
      ? regularSeasonStarted().then((regular) => rpc("player_totals", { p_from: period === "season" ? `${season}-09-01` : addDays(today(), 1 - Number(period)), p_regular: regular }))
      : null,
  ]);
  const recent = new Map<string, SeasonLine>((totals ?? []).map((t) => [t.player_id, {
    season: season + 1, gp: t.gp, min: Number(t.min), fgm: Number(t.fgm), fga: Number(t.fga), reb: Number(t.reb), ast: Number(t.ast),
    stl: Number(t.stl), blk: Number(t.blk), to: Number(t.tov), tf: Number(t.tf), ej: Number(t.ej), pts: Number(t.pts), fpts: Number(t.fpts),
  }]));
  const lineOf = (p: Player) => (period === "last" ? p.last_season : period === "proj" ? p.projection : recent.get(p.id));
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
    .filter((p) => (show === "av" ? !owner.has(p.id) : show === "fa" ? !owner.has(p.id) && !waivers.has(p.id) : show === "wa" ? waivers.has(p.id) : show === "owned" ? owner.has(p.id) : true))
    .filter((p) => !watched || watched.has(p.id))
    .filter((p) => sp.mine !== "0" || owner.get(p.id)?.id !== me?.team?.id)
    .filter((p) => !playing || (!!p.nba_team_id && playing.has(p.nba_team_id)))
    .filter((p) => !sp.team || p.nba_team === sp.team)
    .map((p) => ({ p, v: stat(lineOf(p), sort, perGame) }))
    .sort((a, b) => (a.v == null ? 1 : b.v == null ? -1 : asc ? a.v - b.v : b.v - a.v) || a.p.name.localeCompare(b.p.name));
  const count = Math.max(50, Number(sp.n) || 50);
  const shown = list.slice(0, count);
  const lastYear = players.find((p) => p.last_season?.season)?.last_season?.season ?? season;
  const periods: [string, string][] = [
    ["proj", `Projections (${seasonLabel(season + 1)})`], ["", `Last season (${seasonLabel(lastYear)})`],
    ["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"], ["season", `This season (${seasonLabel(season + 1)})`],
  ];
  const heading = { last: `${seasonLabel(lastYear)} stats`, proj: `${seasonLabel(season + 1)} projections`, season: `${seasonLabel(season + 1)} stats`, 7: "Last 7 days", 14: "Last 14 days", 30: "Last 30 days" }[period];

  return (
    <>
      <FilterBar sp={sp} show={show} play={play} perGame={perGame} period={period} periods={periods} teams={[...new Set(players.map((p) => p.nba_team).filter((t): t is string => !!t && t in NBA_TEAMS))].sort((a, b) => NBA_TEAMS[a].localeCompare(NBA_TEAMS[b]))} />

      <ScrollBox at={href(sp, {})} className="-mx-4 min-h-0 overflow-auto overscroll-contain border-y border-line bg-card sm:mx-0 sm:rounded-xl sm:border">
        <table className="t players whitespace-nowrap">
          <thead>
            <tr className="group">
              <th colSpan={3} className="text-center">Players</th>
              <th colSpan={2} className="text-center border-l border-line">Next game</th>
              <th colSpan={STAT_COLS.length} className="text-center border-l border-line">{heading}</th>
              <th colSpan={2} className="text-center border-l border-line">Fantasy pts</th>
            </tr>
            <tr>
              <th className="stick" aria-label="Photo" />
              <th>Player</th>
              <th className="text-center">Team</th>
              <th className="border-l border-line">Opp</th>
              <th>Time</th>
              {STAT_COLS.map((c, i) => (
                <SortTh key={c.key} sp={sp} sort={sort} asc={asc} k={c.key} label={c.label} title={c.title} className={i === 0 ? "border-l border-line" : ""} />
              ))}
              <SortTh sp={sp} sort={sort} asc={asc} k="tot" label="TOT" title="Fantasy points, total" className="border-l border-line" />
              <SortTh sp={sp} sort={sort} asc={asc} k="avg" label="AVG" title="Fantasy points per game" />
            </tr>
          </thead>
          <tbody>
            {shown.map(({ p }) => {
              const ls = lineOf(p);
              const o = owner.get(p.id);
              const g = p.nba_team_id ? nextGame.get(p.nba_team_id) : undefined;
              return (
                <tr key={p.id}>
                  <td className="stick pr-0">
                    <Link href={`/players/${p.id}`} prefetch={false} transitionTypes={["nav-forward"]} aria-label={p.name}>
                      {p.headshot ? <img src={headshot(p.headshot, 110)!} alt="" loading="lazy" decoding="async" className="block h-9 w-9 max-w-none rounded-full object-cover bg-line" /> : <span className="block h-9 w-9 rounded-full bg-line" />}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/players/${p.id}`} prefetch={false} transitionTypes={["nav-forward"]} className="group">
                      <span className="text-accent group-hover:underline">{p.name}</span>
                      {p.injury_status && <span className="ml-2 text-[10px] font-semibold uppercase text-bad" title={p.injury_note ?? ""}>{p.injury_status}</span>}
                      <span className="block text-xs text-muted">{p.nba_team} · {p.position}</span>
                    </Link>
                  </td>
                  <td className="text-center text-xs font-semibold">
                    {o ? <Link href={`/teams/${o.id}`} prefetch={false} transitionTypes={["nav-forward"]} title={o.name} className="hover:underline">{initials(o.name)}</Link>
                      : waivers.has(p.id) ? <Link href={`/players/${p.id}/add`} prefetch={false} transitionTypes={["nav-forward"]} className="inline-flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-orange text-orange font-bold" title="On waivers: sealed bids" aria-label={`Bid on ${p.name}`}>+</Link>
                      : <Link href={`/players/${p.id}/add`} prefetch={false} transitionTypes={["nav-forward"]} className="inline-flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-good text-good font-bold" title="Free agent" aria-label={`Add ${p.name}`}>+</Link>}
                  </td>
                  <td className="border-l border-line text-accent">{g?.opp ?? <span className="text-muted">–</span>}</td>
                  <td className="text-xs text-muted">{g ? <><LocalTime iso={g.start} mode="day" /> <LocalTime iso={g.start} /></> : "–"}</td>
                  {STAT_COLS.map((c, i) => (
                    <td key={c.key} className={i === 0 ? "n bl" : "n"}>{fmt(stat(ls, c.key, perGame && c.key !== "gp"), perGame, c.key)}</td>
                  ))}
                  <td className="n bl">{fmt(stat(ls, "tot", false), false, "tot")}</td>
                  <td className="n font-semibold">{fmt(stat(ls, "avg", false), false, "avg")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!players.length && <p className="text-muted text-sm p-4">No players yet.</p>}
        {watch && !!players.length && !list.length && <p className="text-muted text-sm p-4">Nobody on your watch list here. Tap the flag on a player&apos;s page to add him.</p>}
        {list.length > shown.length && (
          <div className="sticky left-0 p-2 text-center text-xs">
            <Link href={href(sp, { n: String(count + 50) })} prefetch={false} scroll={false} className="inline-block px-4 py-2 text-accent hover:underline">Show 50 more</Link>
          </div>
        )}
      </ScrollBox>
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
      <Link href={href(sp, { sort: k, dir: on && !asc ? "asc" : undefined, n: undefined })} prefetch={false} scroll={false} className={`underline-offset-4 hover:underline ${on ? "text-fg" : ""}`}>
        {label}{on ? (asc ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

const pill = "h-10 min-w-12 px-4 inline-flex items-center justify-center rounded-full text-sm font-semibold whitespace-nowrap";
const chip = (on: boolean) => `${pill} transition-colors active:opacity-70 ${on ? "border-2 border-fg text-fg bg-card" : "bg-line/70 text-muted hover:text-fg"}`;

// ESPN style filter row: search and filter buttons, then my watch list (the flag) and the position chips. Search opens a full width box instead.
function FilterBar({ sp, show, play, perGame, period, periods, teams }: {
  sp: Params; show: string; play: string; perGame: boolean; period: Period; periods: [string, string][]; teams: string[];
}) {
  const filtered = (!!sp.show && sp.show !== "av") || !perGame || sp.mine === "0" || !!play || !!sp.team || period !== "last";
  if (sp.search || sp.q) {
    const keep = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "q" && k !== "search")) as Record<string, string>;
    return <SearchBar path="/players" params={keep} initial={sp.q ?? ""} cancelHref={href(sp, { q: undefined, search: undefined })} />;
  }
  // The filter button opens ESPN's filter sheet (PlayerFilters): availability, who plays on a day this week, NBA team,
  // which stats.
  const now = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i)).map((d): [string, string] => [d, `${weekday(d).charAt(0)}${weekday(d).slice(1).toLowerCase()}, ${monthDay(d)}`]);
  const keep = Object.fromEntries(Object.entries({ pos: sp.pos, sort: sp.sort, dir: sp.dir, watch: sp.watch }).filter(([, v]) => v)) as Record<string, string>;
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
      <Link href={href(sp, { search: "1" })} prefetch={false} scroll={false} className={`${chip(false)} shrink-0`} aria-label="Search"><SearchIcon /></Link>
      <PlayerFilters
        className={`${chip(filtered)} shrink-0`}
        value={{ show, mine: sp.mine === "0" ? "0" : "", play, team: sp.team ?? "", stats: period === "last" ? "" : period, view: perGame ? "" : "tot" }}
        periods={periods}
        days={days}
        teams={teams.map((t): [string, string] => [t, NBA_TEAMS[t]])}
        keep={keep}
      />
      <span className="h-8 w-px bg-line shrink-0 mx-1" />
      <Link href={href(sp, { watch: sp.watch === "1" ? undefined : "1", n: undefined })} prefetch={false} scroll={false} className={`${chip(sp.watch === "1")} shrink-0`} aria-label="Watch list" aria-pressed={sp.watch === "1"}>
        <FlagIcon on={sp.watch === "1"} />
      </Link>
      {[["", "All"], ...POSITIONS.map((p) => [p, p])].map(([v, label]) => (
        <Link key={label} href={href(sp, { pos: v || undefined, n: undefined })} prefetch={false} scroll={false} className={`${chip((sp.pos ?? "") === v)} shrink-0`}>{label}</Link>
      ))}
    </div>
  );
}

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

