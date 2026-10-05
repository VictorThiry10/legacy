import "server-only";
import { randomInt } from "node:crypto";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { rookieClass } from "./espn";
import { getSettings, type Team } from "./league";
import { drawField, lotteryField, type LotteryTeam } from "./lottery";
import { notifyTeams } from "./push";
import { problemsFor } from "./roster";
import { LENGTHS, ROOKIES, type Rookie } from "./rookies";
import { money, yearsLeft } from "./rules";

// The rookie draft. First the lottery (lib/lottery.ts): drawn once, the first time a GM presses Play, and saved,
// so every GM watches the same order. Then the draft itself: one pick at a time in that order, each GM taking a
// rookie with the pick he holds (picks can be traded, lib/picks.ts) and choosing the contract's length.
// The draft's year is the season in the league settings: it is held before that season.

type PickRow = { id: string; slot: number; team_id: string; player_id: string | null };

// The year's picks in draft order, once the lottery is drawn (empty before). `again` asks in a slightly different
// way: while a page is being drawn, an identical request gets the first one's answer back.
async function picksInOrder(year: number, again = false): Promise<PickRow[]> {
  const q = db().from("draft_picks").select("id, slot, team_id, player_id").eq("year", year).not("slot", "is", null).order("slot");
  const { data, error } = await (again ? q.limit(100) : q);
  if (error) fail(error);
  return (data ?? []) as PickRow[];
}

// The lottery pop-up for this team: the field and its odds, until the team has watched it. Null otherwise.
export async function lotteryPrompt(team: Team): Promise<LotteryTeam[] | null> {
  const field = lotteryField();
  if (!field.some((t) => t.id === team.id)) return null;
  const { season } = await getSettings();
  const { data, error } = await db().from("rookie_lottery_views").select("team_id").eq("year", season).eq("team_id", team.id).maybeSingle();
  if (error) fail(error);
  return data ? null : field;
}

// Play: the draft order, original teams, #1 first. The first call draws it (the server's own randomness, not the
// browser's) and saves it; every later call, from any GM, gets that same order back.
export async function playLottery(): Promise<string[]> {
  const { season } = await getSettings();
  const stored = async (again = false) => {
    const { data, error } = await db().from("draft_picks").select("original_team, slot").eq("year", season).not("slot", "is", null).order("slot").limit(again ? 100 : 50);
    if (error) fail(error);
    return (data ?? []).map((p) => p.original_team);
  };
  let order = await stored();
  if (!order.length) {
    const drawn = drawField(() => randomInt(2 ** 32) / 2 ** 32);
    const first = await rpc("rookie_lottery_save", { p_year: season, p_order: drawn, p_odds: lotteryField().map((t) => ({ team: t.id, odds: t.odds })) });
    order = await stored(true); // if another GM's draw got there first, his is the one
    // tell everyone it's there to watch, without the result (a nice-to-have: never fails the draw)
    if (first) await notifyTeams(order, { title: "Rookie draft lottery", body: "The lottery has been drawn. Open the app to watch it.", url: "/team", tag: "rookie-lottery" }).catch(() => 0);
  }
  return order;
}

// The team has watched the lottery: its pop-up doesn't open again.
export async function lotteryWatched(team: Team) {
  const { season } = await getSettings();
  const { error } = await db().from("rookie_lottery_views").upsert({ year: season, team_id: team.id }, { onConflict: "year,team_id", ignoreDuplicates: true });
  if (error) fail(error);
}

// Where the draft stands for one team.
export type DraftBoard = {
  picks: { slot: number; team: string; player: string | null }[]; // team: who holds the pick; player: the rookie taken
  onClock: number | null; // the slot whose turn it is; null once every pick is made (or before the lottery)
  mine: number | null; // my next pick's slot
  myTurn: boolean;
};
export async function draftBoard(team: Team, again = false): Promise<DraftBoard> {
  const { season } = await getSettings();
  const picks = await picksInOrder(season, again);
  const next = picks.find((p) => !p.player_id);
  const mine = picks.find((p) => !p.player_id && p.team_id === team.id);
  return {
    picks: picks.map((p) => ({ slot: p.slot, team: p.team_id, player: p.player_id })),
    onClock: next?.slot ?? null,
    mine: mine?.slot ?? null,
    myTurn: !!next && next.team_id === team.id,
  };
}

// The Team page's to-do row: only once the team has watched the lottery (no spoiler), and until the last pick is
// made. slot: my own pick still to make, if I have one.
export type DraftRowInfo = { slot: number | null; myTurn: boolean; onClock: { slot: number; team: string } };
export async function draftRow(team: Team): Promise<DraftRowInfo | null> {
  if (await lotteryPrompt(team)) return null;
  const b = await draftBoard(team);
  const next = b.picks.find((p) => p.slot === b.onClock);
  return next ? { slot: b.mine, myTurn: b.myTurn, onClock: { slot: next.slot, team: next.team } } : null;
}

// The draft as a record, for the League page: the lottery's order and who took whom, there for good. A GM who
// hasn't watched the lottery yet gets no order (no spoiler), only the field to go and watch it.
export type DraftRecord = {
  field: LotteryTeam[];
  watched: boolean;
  onClock: number | null;
  picks: { slot: number; team: string; original: string; rookie: { name: string; salary: number; years: number } | null }[];
};
export async function draftRecord(team: Team): Promise<DraftRecord> {
  const field = lotteryField();
  if (await lotteryPrompt(team)) return { field, watched: false, onClock: null, picks: [] };
  const { season } = await getSettings();
  const { data, error } = await db().from("draft_picks").select("slot, team_id, original_team, player_id, player:players(name)").eq("year", season).not("slot", "is", null).order("slot");
  if (error) fail(error);
  const taken = (data ?? []).flatMap((p) => (p.player_id ? [p.player_id] : []));
  const { data: deals } = taken.length ? await db().from("contracts").select("player_id, salary, years").eq("acquired_via", "rookie").eq("season_signed", season).in("player_id", taken) : { data: [] };
  return {
    field,
    watched: true,
    onClock: (data ?? []).find((p) => !p.player_id)?.slot ?? null,
    picks: (data ?? []).map((p) => {
      const deal = deals?.find((c) => c.player_id === p.player_id);
      return {
        slot: p.slot!, team: p.team_id, original: p.original_team,
        rookie: p.player_id ? { name: p.player?.name ?? "?", salary: Number(deal?.salary ?? 0), years: deal?.years ?? 0 } : null,
      };
    }),
  };
}

// What the pick screen offers: every rookie outside the priced eight that nobody has under contract (at the minimum
// salary), and the contract lengths this team has a slot for. The limits are free agency's (1 x 4 years, 2 x 3,
// 3 x 2): they count every active contract by the seasons it has left, this one included. 1 year is always open.
export type DraftOptions = { others: Rookie[]; open: number[] };
export async function draftOptions(team: Team): Promise<DraftOptions> {
  const [{ season, rules }, rookies, { data: mine }] = await Promise.all([
    getSettings(),
    rookieClass().catch(() => []), // ESPN down: the priced eight are still there
    db().from("contracts").select("years, season_signed").eq("team_id", team.id).eq("active", true),
  ]);
  const priced = new Set(ROOKIES.map((r) => r.id));
  const rest = rookies.filter((r) => !priced.has(r.id));
  const { data: signed } = rest.length ? await db().from("contracts").select("player_id").eq("active", true).in("player_id", rest.map((r) => r.id)) : { data: [] };
  const gone = new Set((signed ?? []).map((c) => c.player_id));
  const held: Record<number, number> = {};
  for (const c of mine ?? []) held[yearsLeft(c, season)] = (held[yearsLeft(c, season)] ?? 0) + 1;
  return {
    others: rest
      .filter((r) => !gone.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, position: r.position ?? "", nba: r.nba_team, salary: rules.minSalary }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    open: LENGTHS.filter((len) => rules.slotLimits[len] === undefined || (held[len] ?? 0) < rules.slotLimits[len]),
  };
}

// Make my pick: the rookie signs for his price and the length I chose. Checked here against the draft order, the
// contract lengths, the cap and the roster size; the database then makes the pick and the signing in one step.
export async function pickRookie(team: Team, playerId: string, years: number) {
  const { season } = await getSettings();
  const board = await draftBoard(team, true);
  if (!board.picks.length) throw new Error("The lottery has not been drawn yet.");
  if (!board.myTurn || !board.mine) throw new Error("It is not your pick yet.");
  const options = await draftOptions(team);
  const rookie = [...ROOKIES, ...options.others].find((r) => r.id === playerId);
  if (!rookie) throw new Error("He can't be drafted: not a rookie, or already under contract.");
  if (!LENGTHS.includes(years)) throw new Error("Contracts are 1 to 4 years.");
  if (!options.open.includes(years)) throw new Error(`No ${years}-year slot left.`);
  const problems = await problemsFor([{ teamId: team.id, add: [{ player_id: rookie.id, salary: rookie.salary, years, season_signed: season }], remove: [] }]);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  const slot = await rpc("rookie_pick", {
    p_year: season, p_team: team.id, p_player: rookie.id, p_salary: rookie.salary, p_years: years, p_season: season, p_note: `Rookie draft, pick ${board.mine}`,
  });
  // tell the next GM he's up, without the order or the names: he may not have watched the lottery yet
  // (a nice-to-have: never fails the pick)
  try {
    const next = (await draftBoard(team)).picks.find((p) => !p.player);
    if (next && next.team !== team.id) await notifyTeams([next.team], { title: "Rookie draft", body: "It's your turn to pick.", url: "/team", tag: "rookie-draft" });
  } catch {}
  return `${rookie.name}, ${money(rookie.salary)}, ${years} year${years > 1 ? "s" : ""} (pick ${slot}).`;
}
