import "server-only";
import { db } from "./supabase/server";
import { all, rpc } from "./db";
import { getSettings, teamState, type Player } from "./league";
import { money, rosterProblems } from "./rules";

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

// Would these teams still be legal with these contract changes? Throws with every problem, unless overridden.
async function check(changes: { teamId: string; add: { salary: number; years: number; season_signed: number }[]; remove: string[] }[], override: boolean) {
  const { season, rules } = await getSettings();
  const ids = changes.map((c) => c.teamId);
  const [{ data: contracts }, { data: adj }, { data: teams }] = await Promise.all([
    db().from("contracts").select("id, team_id, salary, years, season_signed, active").in("team_id", ids),
    db().from("cap_adjustments").select("team_id, amount").eq("active", true).in("team_id", ids),
    db().from("teams").select("id, name").in("id", ids),
  ]);
  const problems: string[] = [];
  for (const c of changes) {
    const mine = (contracts ?? []).filter((x) => x.team_id === c.teamId && !c.remove.includes(x.id));
    const after = [...mine, ...c.add.map((a) => ({ ...a, active: true }))];
    const extra = (adj ?? []).filter((a) => a.team_id === c.teamId).reduce((s, a) => s + Number(a.amount), 0);
    const name = teams?.find((t) => t.id === c.teamId)?.name ?? "Team";
    problems.push(...rosterProblems(teamState(c.teamId, after, extra, season), rules).map((p) => `${name}: ${p}`));
  }
  if (problems.length && !override) throw new Error(`Not allowed: ${problems.join("; ")}. Tick "override" to do it anyway.`);
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

export async function releaseContract(contractId: string, note?: string) {
  const { season } = await getSettings();
  await rpc("roster_release", { p_contract: contractId, p_season: season, p_note: note ?? "" });
  return "Released.";
}

// Contracts from team A go to team B and the other way round, in one step.
export async function trade(o: { teamA: string; teamB: string; fromA: string[]; fromB: string[]; note?: string; override?: boolean }) {
  if (o.teamA === o.teamB) throw new Error("Pick two different teams.");
  if (!o.fromA.length && !o.fromB.length) throw new Error("Pick at least one player.");
  const { data: moving } = await db().from("contracts").select("id, salary, years, season_signed").in("id", [...o.fromA, ...o.fromB]);
  const pick = (ids: string[]) => (moving ?? []).filter((c) => ids.includes(c.id));
  const { season, note } = await check(
    [
      { teamId: o.teamA, add: pick(o.fromB), remove: o.fromA },
      { teamId: o.teamB, add: pick(o.fromA), remove: o.fromB },
    ],
    !!o.override,
  );
  await rpc("roster_trade", { p_team_a: o.teamA, p_team_b: o.teamB, p_from_a: o.fromA, p_from_b: o.fromB, p_season: season, p_note: join(o.note, note) });
  return "Trade done.";
}

export type Move = {
  id: string; kind: "sign" | "release" | "trade"; created_at: string; group_id: string | null; note: string | null;
  salary: number | null; years: number | null; team: string; other_team: string | null; player: string; player_id: string;
};

// The transactions log, newest first.
export async function recentMoves(limit = 50): Promise<Move[]> {
  const { data } = await db().from("transactions")
    .select("id, kind, created_at, group_id, note, salary, years, player_id, team:teams!transactions_team_id_fkey(name), other:teams!transactions_other_team_id_fkey(name), player:players(name)")
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map(({ team, other, player, ...m }) => ({
    ...m, kind: m.kind as Move["kind"], team: team?.name ?? "?", other_team: other?.name ?? null, player: player?.name ?? "?",
  }));
}
