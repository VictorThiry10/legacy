import Link from "next/link";
import { getSettings, type TeamSummary } from "@/lib/league";
import { boxLines, gamesBetween, teamAbbrs, type BoxLine } from "@/lib/nba";
import { GameStatus, oppLabel } from "./GameInfo";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { lineupFor } from "@/lib/lineup-store";
import { canPlay, isStarter, slotLabel } from "@/lib/lineup";
import { addDays, isDay, longDate, monthDay, today, weekday } from "@/lib/dates";
import { viewKey, views } from "@/lib/team-views";
import type { SeasonLine } from "@/lib/espn-parse";
import Slide, { BACK, FORWARD } from "./Slide";
import DatePicker from "./DatePicker";
import { money } from "@/lib/rules";
import { moveSlot } from "@/app/team/actions";

type Search = Record<string, string | string[] | undefined>;
const STATS = [
  ["min", "MIN"], ["fgm", "FGM"], ["fgmi", "FGMI"], ["reb", "REB"], ["ast", "AST"],
  ["stl", "STL"], ["blk", "BLK"], ["tov", "TO"], ["ej", "EJ"], ["pts", "PTS"],
] as const;
type Key = (typeof STATS)[number][0];
type Agg = Record<Key, number> & { gp: number; fpts: number };

// ESPN style lineup: one day at a time, a stats view picker, one row per slot. `editable` only for the signed in owner.
export default async function TeamView({ team, editable, base, sp }: { team: TeamSummary; editable: boolean; base: string; sp: Search }) {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const now = today();
  const day = isDay(str("d")) ? str("d") : now;
  const period = viewKey(str("stat"));
  const move = editable && day >= now ? str("move") : "";
  const href = (o: Record<string, string>) => {
    const q = new URLSearchParams({ d: day, stat: period, ...o });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${base}?${q}`;
  };

  const [{ rules, season }, roster, games, abbr] = await Promise.all([getSettings(), rosters([team.id]), gamesBetween(day, day), teamAbbrs()]);
  const [rows, lines] = await Promise.all([lineupFor(team.id, day, roster), boxLines(roster.map((p) => p.id))]);
  const players = new Map(roster.map((p) => [p.id, p]));
  const gameOf = (p?: RosterPlayer) => (p?.nba_team_id ? games.find((g) => g.home_team_id === p.nba_team_id || g.away_team_id === p.nba_team_id) : undefined);
  const locked = (p?: RosterPlayer) => day < now || (!!gameOf(p) && new Date(gameOf(p)!.start) <= new Date());
  const inPeriod = (l: BoxLine) =>
    period === "day" ? l.day === day : period === "season" ? true : l.day > addDays(now, -Number(period)) && l.day <= now;
  const agg = (id: string): Agg => {
    if (period === "last") {
      // last season's totals, from ESPN (saved on each player)
      const s = players.get(id)?.last_season as SeasonLine | null | undefined;
      if (!s?.gp) return { gp: 0, fpts: 0, min: 0, fgm: 0, fgmi: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, ej: 0, pts: 0 };
      return { gp: s.gp, fpts: s.fpts, min: s.min, fgm: s.fgm, fgmi: s.fga - s.fgm, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.to, ej: s.ej, pts: s.pts };
    }
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
  const periodName = views(day, season).find((v) => v.key === period)!.label;
  const dayName = `${weekday(day).charAt(0)}${weekday(day).slice(1).toLowerCase()}, ${monthDay(day)}`;
  const viewsHref = `/team/views?${new URLSearchParams({ back: base, d: day, stat: period })}`;

  return (
    <Slide>
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <h1 className="text-xl font-semibold">{team.name}</h1>
          <p className="text-muted text-sm">
            {team.manager_name ?? team.manager_email} · {team.state.rosterCount}/{rules.rosterMax} players · {money(team.state.salary)} salary ·{" "}
            <span className={team.capSpace < 0 ? "text-bad" : ""}>{money(team.capSpace)} cap space</span>
          </p>
        </div>
      </div>

      <div className="flex items-center border-y border-line -mx-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-card">
        <Link href={href({ d: addDays(day, -1) })} transitionTypes={BACK} className="px-4 py-2 text-xl text-muted hover:text-fg" aria-label="Previous day">‹</Link>
        <div className="flex-1 text-center leading-tight">
          <DatePicker
            day={day} today={now} label={dayName} path={base}
            params={{ stat: period }} from={`${season}-10-01`} to={`${season + 1}-06-30`}
          />
          {day !== now && (
            <Link href={href({ d: now })} transitionTypes={day < now ? FORWARD : BACK} className="block text-[10px] uppercase tracking-wide text-muted hover:text-fg">Today</Link>
          )}
        </div>
        <Link href={href({ d: addDays(day, 1) })} transitionTypes={FORWARD} className="px-4 py-2 text-xl text-muted hover:text-fg" aria-label="Next day">›</Link>
      </div>

      <Link href={viewsHref} transitionTypes={FORWARD} className="flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-accent py-2 text-sm font-semibold text-accent hover:bg-accent/10">
        {periodName}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </Link>

      <Slide key={day}>
      <div className="space-y-4">
      {str("err") && <p className="card text-bad text-sm">{str("err")}</p>}
      {move && moving && <p className="text-sm text-accent">Moving {moving.name}</p>}

      <div className="-mx-4 overflow-x-auto border-y border-line bg-card sm:mx-0 sm:rounded-xl sm:border">
        <table className="t whitespace-nowrap text-[13px] [&_td]:py-1.5 [&_th]:py-2">
          <thead>
            <tr className="hidden sm:table-row [&>th]:text-center [&>th]:border-r [&>th]:border-line">
              <th colSpan={2}>Starters</th>
              <th colSpan={2}>Fantasy pts</th>
              <th colSpan={2}>{longDate(day)}</th>
              <th colSpan={STATS.length} className="!border-r-0">{periodName}{period !== "day" ? " · per game" : ""}</th>
            </tr>
            <tr>
              <th colSpan={2}>Starters</th>
              <th className="text-right">{period === "day" ? "Score" : "Pts"}</th><th className="text-right">Avg</th>
              <th>Opp</th><th>Status</th>
              {STATS.map(([k, label]) => <th key={k} className="text-right">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = r.playerId ? players.get(r.playerId) : undefined;
              const g = gameOf(p);
              const a = p ? agg(p.id) : null;
              const val = (k: Key) => (!a || !a.gp ? "--" : period !== "day" ? (a[k] / a.gp).toFixed(1) : String(a[k]));
              const here =
                moving && movingFrom && r.slot !== movingFrom && r.slot !== "BE" && canPlay(moving, r.slot) &&
                (!p || (canPlay(p, movingFrom) && !locked(p)));
              const firstBench = !isStarter(r.slot) && (i === 0 || isStarter(rows[i - 1].slot));
              return (
                <tr key={`${r.slot}-${i}`} className={`${firstBench ? "[&>td]:border-t-2" : ""} ${r.playerId && r.playerId === move ? "bg-line/50" : ""}`}>
                  <td>
                    <SlotButton
                      label={slotLabel(r.slot)}
                      state={
                        !editable || day < now ? "off"
                        : r.playerId && r.playerId === move ? "moving"
                        : here ? "target"
                        : p && !move && !locked(p) ? "tap"
                        : p && locked(p) ? "locked"
                        : "off"
                      }
                      href={r.playerId === move ? href({ move: "" }) : p ? href({ move: p.id }) : ""}
                      form={here ? { back: href({ move: "" }), day, player: move, to: r.slot } : undefined}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {p?.headshot ? <img src={p.headshot} alt="" className="h-7 w-7 rounded-full object-cover bg-line" /> : <span className="h-7 w-7 rounded-full bg-line inline-block" />}
                      {p ? (
                        <div className="leading-tight">
                          <Link href={`/players/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                          <div className="text-[11px] text-muted">
                            {p.nba_team} · {p.position}
                            {p.injury_status && <span className="text-bad" title={p.injury_note ?? ""}> · {p.injury_status}</span>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">Empty</span>
                      )}
                    </div>
                  </td>
                  <td className="num text-right font-semibold">{a?.gp ? round(a.fpts) : <span className="text-muted">--</span>}</td>
                  <td className="num text-right">{a?.gp ? (a.fpts / a.gp).toFixed(1) : <span className="text-muted">--</span>}</td>
                  <td>{g && p ? oppLabel(g, p.nba_team_id!, abbr) : <span className="text-muted">--</span>}</td>
                  <td className="text-xs">{g && p ? <GameStatus g={g} teamId={p.nba_team_id!} /> : <span className="text-muted">--</span>}</td>
                  {STATS.map(([k]) => <td key={k} className={`num text-right ${val(k) === "--" ? "text-muted" : ""}`}>{val(k)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      </Slide>
    </div>
    </Slide>
  );
}

// The slot pill (ESPN style) is the move control: tap to pick a player up, tap a lit slot to drop him there.
function SlotButton({ label, state, href, form }: {
  label: string; state: "off" | "tap" | "moving" | "target" | "locked"; href: string;
  form?: { back: string; day: string; player: string; to: string };
}) {
  const pill = "inline-flex h-7 min-w-12 px-2.5 items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold whitespace-nowrap";
  if (state === "target" && form) {
    return (
      <form action={moveSlot}>
        <input type="hidden" name="back" value={form.back} />
        <input type="hidden" name="day" value={form.day} />
        <input type="hidden" name="player_id" value={form.player} />
        <input type="hidden" name="to" value={form.to} />
        <button className={`${pill} border-accent bg-accent text-bg`} aria-label={`Move here (${label})`}>{label}</button>
      </form>
    );
  }
  if (state === "moving") return <Link href={href} className={`${pill} border-accent bg-accent/20 text-accent`} aria-label="Cancel move">{label}</Link>;
  if (state === "tap") return <Link href={href} className={`${pill} border-accent text-accent hover:bg-accent/10`} aria-label={`Move (${label})`}>{label}</Link>;
  return (
    <span className={`${pill} border-line text-muted`} title={state === "locked" ? "Locked: his game has started" : undefined}>
      {label}{state === "locked" && " 🔒"}
    </span>
  );
}

const round = (n: number) => String(Math.round(n * 10) / 10);
