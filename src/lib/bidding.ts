import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { getSettings, teamSummaries, type Team } from "./league";
import { maxBid, money, revealRound, RENOUNCE_RIGHTS, ROUND_SECONDS, type Bid, type RevealItem } from "./rules";
import type { Row } from "./supabase/types";
import type { SeasonLine } from "./espn-parse";

// Free agency bidding (/bidding). Rounds of players open for ROUND_SECONDS of sealed bids, then everyone sees the
// reveal at once. Winners can renounce until the commissioner moves on, which signs the winners and opens the next
// round. The pure rules (who wins, ties, over the cap) are resolveRound / revealRound in rules.ts.

export const PER_ROUND = 8;
export const REGULAR_ROUNDS = 8;
const COOKIE = "bid_session";

// ---------- sign in: email only, no code ----------

export const bidTeam = cache(async (): Promise<Team | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { data: s } = await db().from("bid_sessions").select("team_id").eq("token", token).maybeSingle();
  if (!s) return null;
  const { data: team } = await db().from("teams").select("*").eq("id", s.team_id).maybeSingle();
  return team ?? null;
});

export async function signIn(email: string) {
  const clean = email.trim().toLowerCase();
  if (!clean) throw new Error("Enter your email.");
  const { data: teams } = await db().from("teams").select("id, manager_email");
  const team = (teams ?? []).find((t) => t.manager_email.trim().toLowerCase() === clean);
  if (!team) throw new Error("That email isn't linked to a GM.");
  const token = randomBytes(24).toString("base64url");
  const { error } = await db().from("bid_sessions").insert({ token, team_id: team.id });
  if (error) fail(error);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 24 * 3600,
  });
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db().from("bid_sessions").delete().eq("token", token);
  store.delete(COOKIE);
}

// ---------- what everyone sees ----------

export type CardPlayer = {
  id: string; name: string; position: string | null; nbaTeam: string | null; headshot: string | null; injury: string | null;
  stats: { gp: number; fppg: number; ppg: number; rpg: number; apg: number } | null; // last season, per game
};

export function cardOf(p: Row<"players">): CardPlayer {
  const s = p.last_season as SeasonLine | null;
  const per = (x: number) => (s?.gp ? Math.round((x / s.gp) * 10) / 10 : 0);
  return {
    id: p.id, name: p.name, position: p.position, nbaTeam: p.nba_team, headshot: p.headshot, injury: p.injury_status,
    stats: s?.gp ? { gp: s.gp, fppg: per(s.fpts), ppg: per(s.pts), rpg: per(s.reb), apg: per(s.ast) } : null,
  };
}

export type RoomTeam = {
  id: string; name: string; manager: string | null; capSpace: number; maxBid: number; roster: number; renouncesLeft: number; hasBid: boolean;
};
export type RoundInfo = { id: string; number: number; kind: "regular" | "leftovers"; status: string; closesAt: string | null };
export type Signing = { contractId: string; teamId: string; salary: number; years: number; player: CardPlayer };
export type Phase = "waiting" | "bidding" | "reveal" | "contracts" | "done";

export type Room = {
  now: number; // server clock, so every countdown agrees
  phase: Phase;
  meId: string;
  isCommish: boolean;
  teams: RoomTeam[];
  rounds: RoundInfo[];
  round: RoundInfo | null; // live round, or the next one while waiting
  cardsWaiting: number; // players in the next round (still face down)
  players: CardPlayer[];
  myBids: Record<string, number>;
  reveal: RevealItem[] | null;
  signings: Signing[];
  limits: Record<number, number>; // contract lengths: years -> how many per season
  minSalary: number;
};

const roundInfo = (r: Row<"rounds">): RoundInfo => ({
  id: r.id, number: r.number, kind: r.kind === "leftovers" ? "leftovers" : "regular", status: r.status, closesAt: r.closes_at,
});

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

export async function room(team: Team): Promise<Room> {
  const { season, rules } = await getSettings();
  const d = db();
  const [summaries, rs, st, ren] = await Promise.all([
    teamSummaries(),
    d.from("rounds").select("*").eq("season", season).order("number"),
    d.from("settings").select("fa_locked").eq("id", 1).single(),
    d.from("renounces").select("team_id, bid_id").eq("season", season),
  ]);
  if (rs.error) fail(rs.error);
  const rounds = rs.data ?? [];
  const now = Date.now();
  const live = rounds.find((r) => r.status === "open") ?? null;
  const next = rounds.find((r) => r.status === "setup") ?? null;
  const phase: Phase = live
    ? Date.parse(live.closes_at ?? "") > now ? "bidding" : "reveal"
    : next || !rounds.length ? "waiting" : st.data?.fa_locked ? "done" : "contracts";
  const current = live ?? (phase === "waiting" ? next : null);

  const [rp, bidRows, signed] = await Promise.all([
    current ? d.from("round_players").select("pos, player:players(*)").eq("round_id", current.id).order("pos") : null,
    live ? d.from("bids").select("*").eq("round_id", live.id) : null,
    phase === "contracts" || phase === "done"
      ? d.from("contracts").select("id, team_id, salary, years, player:players(*)").eq("season_signed", season).eq("acquired_via", "draft").eq("active", true)
      : null,
  ]);
  const bids: Bid[] = (bidRows?.data ?? []).map((b) => ({ id: b.id, teamId: b.team_id, playerId: b.player_id, amount: Number(b.amount), years: b.years, createdAt: b.created_at }));
  const used = new Map<string, number>();
  (ren.data ?? []).forEach((r) => used.set(r.team_id, (used.get(r.team_id) ?? 0) + 1));
  const bidders = new Set(bids.map((b) => b.teamId));

  const teams: RoomTeam[] = summaries.map((t) => ({
    id: t.id, name: t.name, manager: t.manager_name, capSpace: t.capSpace, maxBid: maxBid(t.state, rules), roster: t.state.rosterCount,
    renouncesLeft: RENOUNCE_RIGHTS - (used.get(t.id) ?? 0), hasBid: phase === "bidding" && bidders.has(t.id),
  }));
  const players = phase === "waiting" ? [] : (rp?.data ?? []).map((x) => one(x.player)).filter((p) => !!p).map(cardOf);

  let reveal: RevealItem[] | null = null;
  if (phase === "reveal" && live) {
    const renounced = new Set((ren.data ?? []).map((r) => r.bid_id));
    reveal = revealRound(players.map((p) => p.id), bids, summaries.map((t) => t.state), rules, renounced, live.id).items;
  }

  return {
    now, phase, meId: team.id, isCommish: team.is_commish, teams,
    rounds: rounds.map(roundInfo),
    round: current ? roundInfo(current) : null,
    cardsWaiting: phase === "waiting" ? (rp?.data?.length ?? 0) : 0,
    players,
    myBids: Object.fromEntries(bids.filter((b) => b.teamId === team.id).map((b) => [b.playerId, b.amount])),
    reveal,
    signings: (signed?.data ?? []).flatMap((c) => {
      const p = one(c.player);
      return p ? [{ contractId: c.id, teamId: c.team_id, salary: Number(c.salary), years: c.years, player: cardOf(p) }] : [];
    }),
    limits: rules.slotLimits,
    minSalary: rules.minSalary,
  };
}

// A short fingerprint of everything that changes the room. Screens poll it and refresh when it moves.
// It never contains bids, so it gives nothing away.
export async function pulse(): Promise<string> {
  const { season } = await getSettings();
  const d = db();
  const [{ data: rounds }, { data: st }, { count: ren }, { data: lens }, { count: teams }] = await Promise.all([
    d.from("rounds").select("id, status, closes_at").eq("season", season).order("number"),
    d.from("settings").select("fa_locked").eq("id", 1).single(),
    d.from("renounces").select("id", { count: "exact", head: true }).eq("season", season),
    d.from("contracts").select("years").eq("season_signed", season).eq("acquired_via", "draft"),
    d.from("teams").select("id", { count: "exact", head: true }),
  ]);
  const live = rounds?.find((r) => r.status === "open");
  const { data: bidders } = live ? await d.from("bids").select("team_id").eq("round_id", live.id) : { data: [] };
  const key = JSON.stringify([rounds, st?.fa_locked, [...new Set((bidders ?? []).map((b) => b.team_id))].sort(), ren, (lens ?? []).map((l) => l.years).sort(), teams]);
  return createHash("sha1").update(key).digest("base64url").slice(0, 16);
}

// ---------- GM moves ----------

// amount in dollars, null to remove the bid. Each bid must fit under the cap on its own; together they may not.
export async function placeBid(team: Team, roundId: string, playerId: string, amount: number | null) {
  if (amount !== null) {
    const { rules } = await getSettings();
    if (!Number.isFinite(amount) || amount < rules.minSalary) throw new Error(`Bids start at ${money(rules.minSalary)}.`);
    if (amount % 100_000) throw new Error("Bids go up in steps of $0.1m.");
    const me = (await teamSummaries()).find((t) => t.id === team.id);
    const max = me ? maxBid(me.state, rules) : 0;
    if (amount > max) throw new Error(max ? `Your max bid is ${money(max)}.` : "Your roster is full.");
  }
  await rpc("bidding_place", { p_round: roundId, p_team: team.id, p_player: playerId, p_amount: amount });
}

export async function renounce(team: Team, bidId: string) {
  const r = await room(team);
  if (r.phase !== "reveal") throw new Error("You can renounce once the round is revealed.");
  if (!r.reveal?.some((i) => i.winner?.bidId === bidId && i.winner.teamId === team.id)) throw new Error("That is not your signing.");
  await rpc("bidding_renounce", { p_bid: bidId, p_team: team.id, p_max: RENOUNCE_RIGHTS });
}

// At the end: contract lengths for my signings. rows: contract id -> years.
export async function setLengths(team: Team, rows: { contractId: string; years: number }[]) {
  const { season, rules } = await getSettings();
  await rpc("bidding_set_lengths", {
    p_team: team.id, p_season: season, p_rows: rows.map((r) => ({ contract_id: r.contractId, years: r.years })), p_limits: rules.slotLimits,
  });
}

// ---------- commissioner ----------

function commish(team: Team) {
  if (!team.is_commish) throw new Error("Commissioner only.");
}

const closesIn = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

export async function startNext(team: Team) {
  commish(team);
  const { season } = await getSettings();
  const { data: rounds } = await db().from("rounds").select("id, status, number").eq("season", season).order("number");
  if (rounds?.some((r) => r.status === "open")) throw new Error("A round is already running.");
  const next = rounds?.find((r) => r.status === "setup");
  if (!next) throw new Error("Set up a round first.");
  const { error } = await db().from("rounds").update({ status: "open", closes_at: closesIn(ROUND_SECONDS) }).eq("id", next.id).eq("status", "setup");
  if (error) fail(error);
}

export async function changeClock(team: Team, seconds: number | "now") {
  commish(team);
  const { season } = await getSettings();
  const { data: live } = await db().from("rounds").select("id, closes_at").eq("season", season).eq("status", "open").maybeSingle();
  if (!live?.closes_at || Date.parse(live.closes_at) <= Date.now()) throw new Error("Bidding is already closed.");
  const closes = seconds === "now" ? new Date().toISOString() : new Date(Date.parse(live.closes_at) + seconds * 1000).toISOString();
  const { error } = await db().from("rounds").update({ closes_at: closes }).eq("id", live.id);
  if (error) fail(error);
}

// Sign this round's winners and open the next round (or the last chance round, or finish).
export async function nextRound(team: Team) {
  commish(team);
  const r = await room(team);
  if (r.phase !== "reveal" || !r.round || !r.reveal) throw new Error("Wait for the reveal first.");
  const { count } = await db().from("renounces").select("id", { count: "exact", head: true }).eq("round_id", r.round.id);
  const awards = r.reveal.flatMap((i) => (i.winner ? [{ player_id: i.playerId, team_id: i.winner.teamId, amount: i.winner.amount }] : []));
  await rpc("bidding_finalize", { p_round: r.round.id, p_awards: awards, p_result: r.reveal, p_renounces: count ?? 0, p_seconds: ROUND_SECONDS });
}

export async function lockContracts(team: Team, locked: boolean) {
  commish(team);
  const { error } = await db().from("settings").update({ fa_locked: locked }).eq("id", 1);
  if (error) fail(error);
}

export async function restart(team: Team) {
  commish(team);
  const { season } = await getSettings();
  await rpc("bidding_restart", { p_season: season });
}

// ---------- commissioner setup: which players go in which round ----------

export type SetupRound = { number: number; id: string | null; status: string; players: CardPlayer[] };

async function taken(season: number) {
  const d = db();
  const [{ data: contracted }, { data: inRounds }] = await Promise.all([
    d.from("contracts").select("player_id").eq("active", true),
    d.from("round_players").select("player_id, round:rounds!inner(season)").eq("round.season", season),
  ]);
  return { contracted: new Set((contracted ?? []).map((c) => c.player_id)), inRounds: new Set((inRounds ?? []).map((r) => r.player_id)) };
}

export async function setupRounds(): Promise<SetupRound[]> {
  const { season } = await getSettings();
  const { data: rounds } = await db().from("rounds").select("id, number, status, kind, round_players(pos, player:players(*))").eq("season", season).eq("kind", "regular").order("number");
  return Array.from({ length: REGULAR_ROUNDS }, (_, i) => {
    const r = rounds?.find((x) => x.number === i + 1);
    const players = [...(r?.round_players ?? [])].sort((a, b) => a.pos - b.pos).map((x) => one(x.player)).filter((p) => !!p).map(cardOf);
    return { number: i + 1, id: r?.id ?? null, status: r?.status ?? "setup", players };
  });
}

// Free agents (no contract, not already in a round) matching a name.
export async function searchFreeAgents(q: string): Promise<CardPlayer[]> {
  const { season } = await getSettings();
  const term = q.trim().replace(/[%_,()]/g, "");
  if (term.length < 2) return [];
  const [{ data }, t] = await Promise.all([db().from("players").select("*").ilike("name", `%${term}%`).limit(40), taken(season)]);
  return (data ?? []).filter((p) => !t.contracted.has(p.id) && !t.inRounds.has(p.id)).slice(0, 12).map(cardOf);
}

async function roundRow(season: number, number: number) {
  const { data: r } = await db().from("rounds").select("id, status").eq("season", season).eq("number", number).maybeSingle();
  if (r && r.status !== "setup") throw new Error(`Round ${number} has already started.`);
  if (r) return r.id;
  const { data, error } = await db().from("rounds").insert({ season, number, kind: "regular" }).select("id").single();
  if (error) fail(error);
  return data!.id;
}

export async function addToRound(team: Team, number: number, playerId: string) {
  commish(team);
  const { season } = await getSettings();
  if (!(number >= 1 && number <= REGULAR_ROUNDS)) throw new Error("Pick a round.");
  const t = await taken(season);
  if (t.contracted.has(playerId)) throw new Error("He's already on a team.");
  if (t.inRounds.has(playerId)) throw new Error("He's already in a round.");
  const id = await roundRow(season, number);
  const { data: now } = await db().from("round_players").select("pos").eq("round_id", id);
  if ((now?.length ?? 0) >= PER_ROUND) throw new Error(`Round ${number} already has ${PER_ROUND} players.`);
  const { error } = await db().from("round_players").insert({ round_id: id, player_id: playerId, pos: Math.max(0, ...(now ?? []).map((x) => x.pos)) + 1 });
  if (error) fail(error);
}

export async function removeFromRound(team: Team, number: number, playerId: string) {
  commish(team);
  const { season } = await getSettings();
  const id = await roundRow(season, number);
  await db().from("round_players").delete().eq("round_id", id).eq("player_id", playerId);
  const { count } = await db().from("round_players").select("player_id", { count: "exact", head: true }).eq("round_id", id);
  if (!count) await db().from("rounds").delete().eq("id", id).eq("status", "setup");
}

// Fill every open spot in rounds 1-8 with the best free agents left, by last season's fantasy points per game.
export async function autoFill(team: Team) {
  commish(team);
  const { season } = await getSettings();
  const [{ data: players }, t, rounds] = await Promise.all([db().from("players").select("id, last_season"), taken(season), setupRounds()]);
  const pool = (players ?? [])
    .filter((p) => !t.contracted.has(p.id) && !t.inRounds.has(p.id))
    .map((p) => {
      const s = p.last_season as SeasonLine | null;
      return { id: p.id, score: s?.gp && s.gp >= 10 ? s.fpts / s.gp : 0 };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const r of rounds) {
    if (r.status !== "setup") continue;
    for (let n = r.players.length; n < PER_ROUND && pool.length; n++) await addToRound(team, r.number, pool.shift()!.id);
  }
}

// GMs who haven't joined the league app yet can be added here so they can sign in to bid.
export async function addTeam(team: Team, name: string, manager: string, email: string) {
  commish(team);
  const { leagueSize } = await getSettings();
  const clean = { name: name.trim(), manager_name: manager.trim() || null, manager_email: email.trim().toLowerCase() };
  if (!clean.name || clean.name.length > 40) throw new Error("Team name: 1 to 40 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.manager_email)) throw new Error("That email looks wrong.");
  const { data: teams } = await db().from("teams").select("manager_email");
  if ((teams?.length ?? 0) >= leagueSize) throw new Error(`The league is full (${leagueSize} teams).`);
  if (teams?.some((t) => t.manager_email.toLowerCase() === clean.manager_email)) throw new Error("That email already has a team.");
  const { error } = await db().from("teams").insert(clean);
  if (error) fail(error);
}
