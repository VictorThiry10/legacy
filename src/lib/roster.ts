import "server-only";
import { db } from "./supabase/server";
import { all, fail, rpc } from "./db";
import type { Move } from "./moves";
import { getSettings, type Player } from "./league";
import { money, rosterProblems, teamState, addsLocked, ADDS_LOCKED } from "./rules";
import { onIR } from "./lineup-store";
import { gamesBetween } from "./nba";
import { today } from "./dates";

// Rosters and every way they change. All roster moves go through here: each one is checked against the
// league rules, then written in one step together with its line in the transactions log.

export type RosterPlayer = Player & { contract_id: string; salary: number; years: number; season_signed: number; team_id: string };

// Active contracts, most expensive first (that order also sets a default lineup).
export async function rosters(teamIds: string[]): Promise<RosterPlayer[]> {
  if (!teamIds.length) return [];
  const rows = await all((a, b) =>
    db().from("contracts").select("id, team_id, salary, years, season_signed, player:players(*)").in("team_id", teamIds).eq("active", true)
      .order("salary", { ascending: false }).range(a, b),
  );
  return rows.map(({ player, id, ...c }) => ({ ...(player as Player), ...c, contract_id: id, salary: Number(c.salary) }));
}

export type Change = { teamId: string; add: { player_id?: string; salary: number; years: number; season_signed: number }[]; remove: string[] };

// Each team's cap picture after these contract changes, read fresh from the database (no page cache).
async function statesAfter(changes: Change[]) {
  const { season } = await getSettings();
  const ids = changes.map((c) => c.teamId);
  const [{ data: contracts }, { data: adj }, { data: teams }] = await Promise.all([
    db().from("contracts").select("id, team_id, player_id, salary, years, season_signed, active").in("team_id", ids),
    db().from("cap_adjustments").select("team_id, amount").eq("active", true).in("team_id", ids),
    db().from("teams").select("id, name").in("id", ids),
  ]);
  const ir = await onIR(ids);
  return changes.map((c) => {
    const mine = (contracts ?? []).filter((x) => x.team_id === c.teamId && !c.remove.includes(x.id));
    const after = [...mine, ...c.add.map((a) => ({ ...a, active: true }))];
    const extra = (adj ?? []).filter((a) => a.team_id === c.teamId).reduce((s, a) => s + Number(a.amount), 0);
    return { name: teams?.find((t) => t.id === c.teamId)?.name ?? "Team", state: teamState(c.teamId, after, extra, season, ir) };
  });
}

// What would break if these contract changes happened? Trades only need every team under the cap (capOnly);
// signings also check roster spots and contract slots.
export async function problemsFor(changes: Change[], capOnly = false): Promise<string[]> {
  const { rules } = await getSettings();
  const problems: string[] = [];
  for (const { name, state } of await statesAfter(changes)) {
    const found = capOnly ? (state.salary > rules.cap ? [`over the ${money(rules.cap)} cap by ${money(state.salary - rules.cap)}`] : []) : rosterProblems(state, rules);
    problems.push(...found.map((p) => `${name}: ${p}`));
  }
  return problems;
}

// Cap space per team right now.
export async function capSpaces(teamIds: string[]): Promise<Map<string, number>> {
  if (!teamIds.length) return new Map();
  const { rules } = await getSettings();
  const states = await statesAfter(teamIds.map((teamId) => ({ teamId, add: [], remove: [] })));
  return new Map(states.map(({ state }) => [state.id, rules.cap - state.salary]));
}

// Same, but throws with every problem unless overridden.
async function check(changes: Change[], override: boolean, capOnly = false, commish = true) {
  const { season } = await getSettings();
  const problems = await problemsFor(changes, capOnly);
  if (problems.length && !override) throw new Error(`Not allowed: ${problems.join("; ")}.${commish ? ' Tick "override" to do it anyway.' : ""}`);
  return { season, note: problems.length ? `Rules overridden (${problems.join("; ")})` : "" };
}

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || "";

export async function signPlayer(o: {
  teamId: string; playerId: string; salary: number; years: number; seasonSigned?: number; via?: string; note?: string; override?: boolean;
}) {
  if (!(o.salary > 0)) throw new Error("Salary must be more than $0m.");
  if (![1, 2, 3, 4].includes(o.years)) throw new Error("Contracts are 1 to 4 years.");
  const { data: taken } = await db().from("contracts").select("team:teams(name)").eq("player_id", o.playerId).eq("active", true).maybeSingle();
  if (taken) throw new Error(`Already under contract with ${taken.team?.name ?? "another team"}.`);
  const { season } = await getSettings();
  const seasonSigned = o.seasonSigned ?? season;
  const { note } = await check([{ teamId: o.teamId, add: [{ salary: o.salary, years: o.years, season_signed: seasonSigned }], remove: [] }], !!o.override);
  await rpc("roster_sign", {
    p_team: o.teamId, p_player: o.playerId, p_salary: o.salary, p_years: o.years, p_season_signed: seasonSigned,
    p_season: season, p_via: o.via ?? "manual", p_note: join(o.note, note),
  });
  return `Signed for ${money(o.salary)}, ${o.years} year${o.years > 1 ? "s" : ""}.`;
}

// Free agent pickup: $min salary for 1 year, first come first served. A full roster must drop someone in the same step.
// The dropped player goes on waivers (lib/waivers.ts), and so a player on waivers can't be picked up this way.
export async function pickUp(o: { teamId: string; playerId: string; dropContractId?: string }) {
  if (addsLocked()) throw new Error(ADDS_LOCKED);
  const { season, rules } = await getSettings();
  const { data: taken } = await db().from("contracts").select("id").eq("player_id", o.playerId).eq("active", true).maybeSingle();
  if (taken) throw new Error("Someone just picked him up.");
  const { data: waived } = await db().from("waivers").select("id").eq("player_id", o.playerId).eq("status", "open").maybeSingle();
  if (waived) throw new Error("He is on waivers: place a bid instead.");
  const mine = await rosters([o.teamId]);
  const ir = await onIR([o.teamId]);
  const onRoster = mine.filter((p) => !ir.has(p.id)).length;
  if (o.dropContractId && !mine.some((p) => p.contract_id === o.dropContractId)) throw new Error("That player is no longer on your team.");
  if (!o.dropContractId && onRoster >= rules.rosterMax) throw new Error(`Your roster is full (${rules.rosterMax}). Pick a player to drop.`);
  const leaving = mine.find((p) => p.contract_id === o.dropContractId);
  if (leaving && (await lockedToday(leaving))) throw new Error(lockedMessage(leaving.name));
  await check([{ teamId: o.teamId, add: [{ player_id: o.playerId, salary: rules.minSalary, years: 1, season_signed: season }], remove: o.dropContractId ? [o.dropContractId] : [] }], false, false, false);
  const { data: who } = await db().from("players").select("name").eq("id", o.playerId).single();
  const dropped = mine.find((p) => p.contract_id === o.dropContractId);
  try {
    await rpc("roster_pickup", {
      p_team: o.teamId, p_player: o.playerId, p_salary: rules.minSalary, p_season: season, p_drop: o.dropContractId ?? null,
      p_note: dropped ? `Free agent pickup, dropped ${dropped.name}` : "Free agent pickup",
    });
  } catch (e) {
    // two people tapped Add at once: the database lets only one contract per player exist
    if (e instanceof Error && /one_active_contract_per_player|duplicate key/i.test(e.message)) throw new Error("Someone just picked him up.");
    throw e;
  }
  return `${who?.name ?? "Player"} added${dropped ? `, ${dropped.name} dropped to waivers` : ""}.`;
}

// Has his NBA game today started (or finished)? Today's lineups are re-frozen from the rosters every 10 minutes,
// so dropping him now would take his points out of today's score. He can go tomorrow.
export async function lockedToday(p: { nba_team_id?: string | null }) {
  if (!p.nba_team_id) return false;
  const day = today();
  return (await gamesBetween(day, day)).some((g) => (g.home_team_id === p.nba_team_id || g.away_team_id === p.nba_team_id) && new Date(g.start) <= new Date());
}
export const lockedMessage = (name: string) => `Locked until tomorrow: ${name}'s game has started.`;

// A GM drops one of their players. He goes on waivers (lib/waivers.ts) and his salary comes off the cap.
export async function dropPlayer(o: { teamId: string; contractId: string }) {
  const p = (await rosters([o.teamId])).find((r) => r.contract_id === o.contractId);
  if (!p) throw new Error("That player is no longer on your team.");
  if (await lockedToday(p)) throw new Error(lockedMessage(p.name));
  await releaseContract(o.contractId, "Dropped");
  return `${p.name} dropped. He's on waivers now.`;
}

export async function releaseContract(contractId: string, note?: string) {
  const { season } = await getSettings();
  await rpc("roster_release", { p_contract: contractId, p_season: season, p_note: note ?? "" });
  return "Released. He's on waivers now.";
}

// Contracts from team A go to team B and the other way round, in one step.
export async function trade(o: { teamA: string; teamB: string; fromA: string[]; fromB: string[]; note?: string; override?: boolean }) {
  if (o.teamA === o.teamB) throw new Error("Pick two different teams.");
  if (!o.fromA.length && !o.fromB.length) throw new Error("Pick at least one player.");
  const { data: moving } = await db().from("contracts").select("id, player_id, salary, years, season_signed").in("id", [...o.fromA, ...o.fromB]);
  const pick = (ids: string[]) => (moving ?? []).filter((c) => ids.includes(c.id));
  const { season, note } = await check(
    [
      { teamId: o.teamA, add: pick(o.fromB), remove: o.fromA },
      { teamId: o.teamB, add: pick(o.fromA), remove: o.fromB },
    ],
    !!o.override,
    true, // trades: each team just has to stay under the cap
  );
  await rpc("roster_trade", { p_team_a: o.teamA, p_team_b: o.teamB, p_from_a: o.fromA, p_from_b: o.fromB, p_season: season, p_note: join(o.note, note) });
  return "Trade done.";
}

export type { Move };

// The transactions log, newest first.
export async function recentMoves(limit = 50): Promise<Move[]> {
  const { data } = await db().from("transactions")
    .select("id, kind, created_at, group_id, note, salary, years, player_id, team_id, other_team_id, team:teams!transactions_team_id_fkey(name), other:teams!transactions_other_team_id_fkey(name), player:players(name), pick:draft_picks(year, original:teams!draft_picks_original_team_fkey(name)), contract:contracts(acquired_via)")
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map(({ team, other, player, pick, contract, ...m }) => ({
    ...m, kind: m.kind as Move["kind"], team: team?.name ?? "?", other_team: other?.name ?? null, via: contract?.acquired_via ?? null,
    player: pick ? `${pick.year} pick (${pick.original?.name ?? "?"})` : player?.name ?? "?",
  }));
}

// The Team page's Recent moves row: the latest move, and a red dot when another team has made a move since this GM
// last opened the log (never opened: any move by another team). Null without a move yet.
export type MovesRowInfo = { latest: Move; unseen: boolean };
export async function movesRow(teamId: string): Promise<MovesRowInfo | null> {
  const [[latest], { data: seen, error }] = await Promise.all([recentMoves(1), db().from("moves_seen").select("seen_at").eq("team_id", teamId).maybeSingle()]);
  if (error) fail(error);
  if (!latest) return null;
  let q = db().from("transactions").select("id", { count: "exact", head: true }).neq("team_id", teamId).or(`other_team_id.is.null,other_team_id.neq.${teamId}`);
  if (seen) q = q.gt("created_at", seen.seen_at);
  const { count, error: e } = await q;
  if (e) fail(e);
  return { latest, unseen: (count ?? 0) > 0 };
}

// This GM has opened the log: the dot goes until the next move.
export async function markMovesSeen(teamId: string) {
  const { error } = await db().from("moves_seen").upsert({ team_id: teamId, seen_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) fail(error);
}
