import Link from "next/link";
import { getSettings, type TeamSummary } from "@/lib/league";
import { boxLines, gamesBetween, lineupFor, rosters, teamAbbrs, today, type BoxLine, type Game, type RosterPlayer } from "@/lib/fantasy";
import { addDays, canPlay, isDay, isStarter, slotLabel } from "@/lib/lineup";
import { money } from "@/lib/rules";
import { moveSlot } from "@/app/team/actions";

type Search = Record<string, string | string[] | undefined>;
const STATS = [
  ["min", "MIN"], ["fgm", "FGM"], ["fgmi", "FGMI"], ["reb", "REB"], ["ast", "AST"],
  ["stl", "STL"], ["blk", "BLK"], ["tov", "TO"], ["ej", "EJ"], ["pts", "PTS"],
] as const;
type Key = (typeof STATS)[number][0];
type Agg = Record<Key, number> & { gp: number; fpts: number };

// ESPN style lineup: date strip, stats period, one row per slot. `editable` only for the signed in owner.
export default async function TeamView({ team, editable, base, sp }: { team: TeamSummary; editable: boolean; base: string; sp: Search }) {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const now = today();
  const day = isDay(str("d")) ? str("d") : now;
  const period = ["day", "7", "15", "season"].includes(str("stat")) ? str("stat") : "season";
  const mode = str("mode") === "tot" ? "tot" : "avg";
  const move = editable && day >= now ? str("move") : "";
  const href = (o: Record<string, string>) => {
    const q = new URLSearchParams({ d: day, stat: period, mode, ...o });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${base}?${q}`;
  };

  const [{ rules }, roster, games, abbr] = await Promise.all([getSettings(), rosters([team.id]), gamesBetween(day, day), teamAbbrs()]);
  const [rows, lines] = await Promise.all([lineupFor(team.id, day, roster), boxLines(roster.map((p) => p.id))]);
  const players = new Map(roster.map((p) => [p.id, p]));
  const gameOf = (p?: RosterPlayer) => (p?.nba_team_id ? games.find((g) => g.home_team_id === p.nba_team_id || g.away_team_id === p.nba_team_id) : undefined);
  const locked = (p?: RosterPlayer) => day < now || (!!gameOf(p) && new Date(gameOf(p)!.start) <= new Date());
  const inPeriod = (l: BoxLine) =>
    period === "day" ? l.day === day : period === "season" ? true : l.day > addDays(now, -Number(period)) && l.day <= now;
  const agg = (id: string): Agg => {
    const a: Agg = { gp: 0, fpts: 0, min: 0, fgm: 0, fgmi: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, ej: 0, pts: 0 };
    for (const l of lines) {
      if (l.playerId !== id || !inPeriod(l)) continue;
      a.gp++; a.fpts += l.fpts; a.min += l.min; a.fgm += l.fgm; a.fgmi += l.fga - l.fgm; a.reb += l.reb;
      a.ast += l.ast; a.stl += l.stl; a.blk += l.blk; a.tov += l.tov; a.ej += l.ej; a.pts += l.pts;
    }
    return a;
  };
  const moving = move ? players.get(move) : undefined;
  const movingFrom = rows.find((r) => r.playerId === move)?.slot;
  const starterPts = rows.filter((r) => r.playerId && isStarter(r.slot)).reduce((s, r) => s + agg(r.playerId!).fpts, 0);
  const periodName = ({ day: shortDate(day), "7": "Last 7 days", "15": "Last 15 days", season: "Season" } as Record<string, string>)[period];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          <p className="text-muted text-sm">
            {team.manager_name ?? team.manager_email} · {team.state.rosterCount}/{rules.rosterMax} players · {money(team.state.salary)} salary ·{" "}
            <span className={team.capSpace < 0 ? "text-bad" : ""}>{money(team.capSpace)} cap space</span>
          </p>
        </div>
        {editable && <Link href="/players" className="btn-ghost ml-auto">+ Add</Link>}
      </div>

      <div className="card flex items-center gap-2 overflow-x-auto">
        <span className="text-sm font-medium whitespace-nowrap mr-2">{editable ? "Set Lineup" : "Lineup"}</span>
        <Link href={href({ d: addDays(day, -1) })} className="btn-ghost px-2" aria-label="Previous day">‹</Link>
        {[-2, -1, 0, 1, 2].map((n) => {
          const d = addDays(day, n);
          return (
            <Link key={d} href={href({ d })} className={`text-center px-3 leading-tight ${n === 0 ? "text-accent" : "text-muted hover:text-fg"}`}>
              <div className="text-[11px] uppercase">{shortDate(d)}</div>
              <div className={`text-lg ${n === 0 ? "font-semibold" : ""}`}>{d === now ? "TODAY" : weekday(d)}</div>
            </Link>
          );
        })}
        <Link href={href({ d: addDays(day, 1) })} className="btn-ghost px-2" aria-label="Next day">›</Link>
        {day !== now && <Link href={href({ d: now })} className="text-xs text-muted hover:text-fg ml-2 whitespace-nowrap">Back to today</Link>}
      </div>

      {str("err") && <p className="card text-bad text-sm">{str("err")}</p>}
      {move && moving && <p className="text-sm text-accent">Moving {moving.name}: pick a slot marked Here, or cancel.</p>}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
        <span className="pb-2 -mb-px border-b-2 border-accent font-semibold text-sm">Stats</span>
        <div className="ml-auto flex flex-wrap items-center gap-3 pb-2 text-sm">
          <span className="text-muted">Show stats</span>
          <Pills items={[["day", shortDate(day)], ["7", "Last 7"], ["15", "Last 15"], ["season", "Season"]]} active={period} to={(v) => href({ stat: v })} />
          {period !== "day" && <Pills items={[["tot", "Totals"], ["avg", "Averages"]]} active={mode} to={(v) => href({ mode: v })} />}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="t whitespace-nowrap">
          <thead>
            <tr className="[&>th]:text-center [&>th]:border-r [&>th]:border-line">
              <th colSpan={3}>Starters</th>
              <th colSpan={2}>{longDate(day)}</th>
              <th colSpan={STATS.length}>Stats · {periodName}{period !== "day" ? (mode === "avg" ? " · per game" : " · totals") : ""}</th>
              <th colSpan={2} className="!border-r-0">Fantasy pts</th>
            </tr>
            <tr>
              <th>Slot</th><th>Player</th><th>Action</th><th>Opp</th><th>Status</th>
              {STATS.map(([k, label]) => <th key={k} className="text-right">{label}</th>)}
              <th className="text-right">Tot</th><th className="text-right">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = r.playerId ? players.get(r.playerId) : undefined;
              const g = gameOf(p);
              const a = p ? agg(p.id) : null;
              const val = (k: Key) => (!a || !a.gp ? "--" : mode === "avg" && period !== "day" ? (a[k] / a.gp).toFixed(1) : String(a[k]));
              const here =
                moving && movingFrom && r.slot !== movingFrom && r.slot !== "BE" && canPlay(moving, r.slot) &&
                (!p || (canPlay(p, movingFrom) && !locked(p)));
              const firstBench = !isStarter(r.slot) && (i === 0 || isStarter(rows[i - 1].slot));
              return (
                <tr key={`${r.slot}-${i}`} className={`${firstBench ? "[&>td]:border-t-2" : ""} ${r.playerId && r.playerId === move ? "bg-line/50" : ""}`}>
                  <td className="text-muted">{slotLabel(r.slot)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {p?.headshot ? <img src={p.headshot} alt="" className="h-8 w-8 rounded-full object-cover bg-line" /> : <span className="h-8 w-8 rounded-full bg-line inline-block" />}
                      {p ? (
                        <div className="leading-tight">
                          <Link href={`/players/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                          <div className="text-xs text-muted">
                            {p.nba_team} · {p.position}
                            {p.injury_status && <span className="text-bad" title={p.injury_note ?? ""}> · {p.injury_status}</span>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">Empty</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {editable && day >= now && (
                      r.playerId && r.playerId === move ? (
                        <Link href={href({ move: "" })} className="text-xs text-muted hover:text-fg">Cancel</Link>
                      ) : here ? (
                        <form action={moveSlot}>
                          <input type="hidden" name="back" value={href({ move: "" })} />
                          <input type="hidden" name="day" value={day} />
                          <input type="hidden" name="player_id" value={move} />
                          <input type="hidden" name="to" value={r.slot} />
                          <button className="text-xs font-semibold text-accent">HERE</button>
                        </form>
                      ) : p && !move ? (
                        locked(p) ? <span className="text-xs text-muted">Locked</span> : <Link href={href({ move: p.id })} className="text-xs font-semibold hover:text-accent">MOVE</Link>
                      ) : null
                    )}
                  </td>
                  <td>{g && p ? opp(g, p.nba_team_id!, abbr) : <span className="text-muted">--</span>}</td>
                  <td className="text-xs">{g && p ? status(g, p.nba_team_id!) : <span className="text-muted">--</span>}</td>
                  {STATS.map(([k]) => <td key={k} className={`num text-right ${val(k) === "--" ? "text-muted" : ""}`}>{val(k)}</td>)}
                  <td className="num text-right">{a?.gp ? round(a.fpts) : <span className="text-muted">--</span>}</td>
                  <td className="num text-right">{a?.gp ? (a.fpts / a.gp).toFixed(1) : <span className="text-muted">--</span>}</td>
                </tr>
              );
            })}
            <tr className="font-medium">
              <td colSpan={5 + STATS.length} className="text-right text-muted text-xs uppercase">Starters total</td>
              <td className="num text-right">{round(starterPts)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {day < now && <p className="text-xs text-muted">Past day: this is the lineup that counted. It can no longer change.</p>}
      {editable && day >= now && <p className="text-xs text-muted">Changes apply to this day and every later day until you change them again. A player locks when his game tips off.</p>}
    </div>
  );
}

function Pills({ items, active, to }: { items: [string, string][]; active: string; to: (v: string) => string }) {
  return (
    <span className="inline-flex rounded-lg border border-line overflow-hidden">
      {items.map(([v, label]) => (
        <Link key={v} href={to(v)} className={`px-2.5 py-1 text-xs ${v === active ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>{label}</Link>
      ))}
    </span>
  );
}

const round = (n: number) => String(Math.round(n * 10) / 10);
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const shortDate = (day: string) => at(day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
const longDate = (day: string) => at(day).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const weekday = (day: string) => at(day).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();

function opp(g: Game, teamId: string, abbr: Map<string, string>) {
  return g.home_team_id === teamId ? abbr.get(g.away_team_id) ?? "?" : `@${abbr.get(g.home_team_id) ?? "?"}`;
}

function status(g: Game, teamId: string) {
  if (g.state === "pre") return new Date(g.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
  const home = g.home_team_id === teamId;
  const us = (home ? g.home_score : g.away_score) ?? 0;
  const them = (home ? g.away_score : g.home_score) ?? 0;
  if (g.state === "in") return <span className="text-accent">Live {us}-{them}</span>;
  return <span className={us > them ? "text-good" : "text-bad"}>{us > them ? "W" : "L"} {us}-{them}</span>;
}
