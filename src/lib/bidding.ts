import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./supabase/server";
import { getMe } from "./auth";
import { fail, rpc } from "./db";
import { getSettings, teamSummaries, type Team } from "./league";
import { BID_STEP, maxBid, money, revealRound, RENOUNCE_RIGHTS, ROUND_SECONDS, type Bid, type RevealItem } from "./rules";
import type { Row } from "./supabase/types";
import type { SeasonLine } from "./espn-parse";

// Free agency bidding (/bidding). Rounds of players open for ROUND_SECONDS of sealed bids, then everyone sees the
// reveal at once. Winners can renounce until the commissioner moves on, which signs the winners and opens the next
// round. The pure rules (who wins, ties, over the cap) are resolveRound / revealRound in rules.ts.

export const PER_ROUND = 8;
export const REGULAR_ROUNDS = 8;
const COOKIE = "bid_session";

// ---------- sign in: email only, no code, or the league app's login ----------

// Joined rows come back as an object or a one item list depending on the relation: always one or null.
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

// The bidding site's own sign in (the bid_session cookie) first, then the league app's login, so GMs coming from
// the app (the Team page's to-do card) are already in.
export const bidTeam = cache(async (): Promise<Team | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) {
    // The session and its team in one read, through the team_id foreign key.
    const { data: s } = await db().from("bid_sessions").select("team:teams(*)").eq("token", token).maybeSingle();
    const team = one(s?.team ?? null);
    if (team) return team;
  }
  return (await getMe().catch(() => null))?.team ?? null;
});

// Signed in to the league app: the room links back to it, and has no sign out of its own.
export const inLeagueApp = async () => !!(await getMe().catch(() => null))?.team;

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
  id: string; name: string; manager: string | null; capSpace: number; maxBid: number; roster: number; spots: number; renouncesLeft: number; hasBid: boolean;
};
export type RoundInfo = { id: string; number: number; kind: "regular" | "leftovers"; status: string; closesAt: string | null };
export type Signing = { contractId: string; teamId: string; salary: number; years: number; player: CardPlayer };
export type Phase = "waiting" | "bidding" | "reveal" | "contracts" | "done";

export type Room = {
  now: number; // server clock, so every countdown agrees
  phase: Phase;
  meId: string;
  isCommish: boolean; // commissioner, signed in to the league app too
  needsLeagueLogin: boolean; // commissioner by email only: controls stay hidden until the league login
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
  v: string; // the room's fingerprint (what pulse() returns), so the page knows if a poll brings news
};

const roundInfo = (r: Row<"rounds">): RoundInfo => ({
  id: r.id, number: r.number, kind: r.kind === "leftovers" ? "leftovers" : "regular", status: r.status, closesAt: r.closes_at,
});

// Where free agency is, from the season's rounds (in order): the live round, else the next one set up.
function phaseOf<R extends { status: string; closes_at: string | null }>(rounds: R[], faLocked: boolean, now: number) {
  const live = rounds.find((r) => r.status === "open") ?? null;
  const next = rounds.find((r) => r.status === "setup") ?? null;
  const phase: Phase = live
    ? Date.parse(live.closes_at ?? "") > now ? "bidding" : "reveal"
    : next || !rounds.length ? "waiting" : faLocked ? "done" : "contracts";
  return { phase, live, next };
}

export async function room(team: Team): Promise<Room> {
  const verified = commishVerified(team); // league login check, only does work for the commissioner
  const { season, rules, faLocked } = await getSettings();
  const d = db();
  // Everything in one wave of reads: the open round's players and bids come through an inner join on the
  // round (status and season), so they don't wait for the rounds list.
  const [summaries, rs, ren, rp, bidRows, lens] = await Promise.all([
    teamSummaries(),
    d.from("rounds").select("*, round_players(count)").eq("season", season).order("number"),
    d.from("renounces").select("team_id, bid_id").eq("season", season),
    d.from("round_players").select("round_id, pos, player:players(*, contracts(active)), round:rounds!inner(status, season)").eq("round.status", "open").eq("round.season", season).order("pos"),
    d.from("bids").select("*, round:rounds!inner(status, season)").eq("round.status", "open").eq("round.season", season),
    d.from("contracts").select("years").eq("season_signed", season).eq("acquired_via", "draft"),
  ]);
  if (rs.error) fail(rs.error);
  const rounds = rs.data ?? [];
  const now = Date.now();
  const { phase, live, next } = phaseOf(rounds, faLocked, now);
  const current = live ?? (phase === "waiting" ? next : null);

  // Only the contracts screens need the signings: a second read once the phase is known (nothing is live then).
  const signed = phase === "contracts" || phase === "done"
    ? await d.from("contracts").select("id, team_id, salary, years, player:players(*)").eq("season_signed", season).eq("acquired_via", "draft").eq("active", true)
    : null;
  // Rows of the live round only (the reads ran side by side, so check they agree on which round that is).
  const bids: Bid[] = (bidRows.data ?? []).filter((b) => b.round_id === live?.id)
    .map((b) => ({ id: b.id, teamId: b.team_id, playerId: b.player_id, amount: Number(b.amount), years: b.years, createdAt: b.created_at }));
  const used = new Map<string, number>();
  (ren.data ?? []).forEach((r) => used.set(r.team_id, (used.get(r.team_id) ?? 0) + 1));
  const bidders = new Set(bids.map((b) => b.teamId));

  const teams: RoomTeam[] = summaries.map((t) => ({
    id: t.id, name: t.name, manager: t.manager_name, capSpace: t.capSpace, maxBid: Math.floor(maxBid(t.state, rules) / BID_STEP) * BID_STEP, roster: t.state.rosterCount,
    spots: Math.max(0, rules.rosterMax - t.state.rosterCount), renouncesLeft: RENOUNCE_RIGHTS - (used.get(t.id) ?? 0), hasBid: phase === "bidding" && bidders.has(t.id),
  }));
  // A player who joined a team some other way after his round was set up (a free agent pickup) is out of the auction:
  // no card, no reveal, nobody signs him twice.
  const players = phase === "waiting" || !live ? [] : (rp.data ?? []).filter((x) => x.round_id === live.id).map((x) => one(x.player))
    .filter((p) => !!p && !p.contracts.some((c) => c.active)).map((p) => cardOf(p!));

  let reveal: RevealItem[] | null = null;
  if (phase === "reveal" && live) {
    const renounced = new Set((ren.data ?? []).map((r) => r.bid_id));
    reveal = revealRound(players.map((p) => p.id), bids, summaries.map((t) => t.state), rules, renounced, live.id).items;
  }

  return {
    now, phase, meId: team.id, isCommish: await verified, needsLeagueLogin: team.is_commish && !(await verified), teams,
    rounds: rounds.map(roundInfo),
    round: current ? roundInfo(current) : null,
    cardsWaiting: phase === "waiting" ? (current?.round_players[0]?.count ?? 0) : 0,
    players,
    myBids: Object.fromEntries(bids.filter((b) => b.teamId === team.id).map((b) => [b.playerId, b.amount])),
    reveal,
    signings: (signed?.data ?? []).flatMap((c) => {
      const p = one(c.player);
      return p ? [{ contractId: c.id, teamId: c.team_id, salary: Number(c.salary), years: c.years, player: cardOf(p) }] : [];
    }),
    limits: rules.slotLimits,
    minSalary: rules.minSalary,
    v: fingerprint({
      rounds, faLocked, bidders: [...bidders], renounces: ren.data?.length ?? 0, years: (lens.data ?? []).map((l) => l.years), teams: summaries.length,
    }),
  };
}

// A short fingerprint of everything that changes the room. Screens poll it and refresh when it moves.
// It never contains bids, so it gives nothing away. room() and pulse() both build it here, from the same reads.
function fingerprint(x: {
  rounds: { id: string; status: string; closes_at: string | null }[]; faLocked: boolean; bidders: string[]; renounces: number; years: number[]; teams: number;
}) {
  const key = JSON.stringify([
    x.rounds.map((r) => [r.id, r.status, r.closes_at]), x.faLocked, [...new Set(x.bidders)].sort(), x.renounces, [...x.years].sort((a, b) => a - b), x.teams,
  ]);
  return createHash("sha1").update(key).digest("base64url").slice(0, 16);
}

// Polled every couple of seconds by every screen: one wave of small reads once the season is known.
export async function pulse(): Promise<string> {
  const { season, faLocked } = await getSettings();
  const d = db();
  const [{ data: rounds }, { count: ren }, { data: lens }, { count: teams }, { data: bidders }] = await Promise.all([
    d.from("rounds").select("id, status, closes_at").eq("season", season).order("number"),
    d.from("renounces").select("id", { count: "exact", head: true }).eq("season", season),
    d.from("contracts").select("years").eq("season_signed", season).eq("acquired_via", "draft"),
    d.from("teams").select("id", { count: "exact", head: true }),
    d.from("bids").select("team_id, round:rounds!inner(status, season)").eq("round.status", "open").eq("round.season", season),
  ]);
  return fingerprint({
    rounds: rounds ?? [], faLocked, bidders: (bidders ?? []).map((b) => b.team_id), renounces: ren ?? 0, years: (lens ?? []).map((l) => l.years), teams: teams ?? 0,
  });
}

// The league app's way in (the Team page's to-do card): where free agency is for this team. Null before any round
// is set up and once contracts are locked.
export type AppStatus = { phase: Exclude<Phase, "done">; round: RoundInfo | null; isCommish: boolean; signings: number };

export async function appStatus(team: Team): Promise<AppStatus | null> {
  const { season, faLocked } = await getSettings();
  const { data: rounds } = await db().from("rounds").select("*").eq("season", season).order("number");
  if (!rounds?.length) return null;
  const { phase, live, next } = phaseOf(rounds, faLocked, Date.now());
  if (phase === "done") return null;
  const { count } = phase === "contracts"
    ? await db().from("contracts").select("id", { count: "exact", head: true }).eq("team_id", team.id).eq("season_signed", season).eq("acquired_via", "draft").eq("active", true)
    : { count: 0 };
  const round = live ?? next;
  return { phase, round: round ? roundInfo(round) : null, isCommish: team.is_commish, signings: count ?? 0 };
}

// ---------- GM moves ----------

// amount in dollars, null to remove the bid. Each bid must fit under the cap on its own; together they may not.
export async function placeBid(team: Team, roundId: string, playerId: string, amount: number | null) {
  if (amount !== null) {
    const { rules } = await getSettings();
    if (!Number.isFinite(amount) || amount < rules.minSalary) throw new Error(`Bids start at ${money(rules.minSalary)}.`);
    if (amount % BID_STEP) throw new Error("Bids are in whole millions.");
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

// Commissioner powers need both the commissioner's team here and the league app login (email plus a 6 digit
// code) in the same browser, so knowing the commissioner's email isn't enough to run the draft.
export async function commishVerified(team: Team) {
  if (!team.is_commish) return false;
  const me = await getMe().catch(() => null);
  return !!me?.team?.is_commish;
}

async function commish(team: Team) {
  if (!(await commishVerified(team))) {
    throw new Error(team.is_commish ? "Sign in to the league app in this browser to run the draft." : "Commissioner only.");
  }
}

const closesIn = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

export async function startNext(team: Team) {
  await commish(team);
  const { season } = await getSettings();
  const { data: rounds } = await db().from("rounds").select("id, status, number").eq("season", season).order("number");
  if (rounds?.some((r) => r.status === "open")) throw new Error("A round is already running.");
  const next = rounds?.find((r) => r.status === "setup");
  if (!next) throw new Error("Set up a round first.");
  const { error } = await db().from("rounds").update({ status: "open", closes_at: closesIn(ROUND_SECONDS) }).eq("id", next.id).eq("status", "setup");
  if (error) fail(error);
}

export async function changeClock(team: Team, seconds: number | "now") {
  await commish(team);
  const { season } = await getSettings();
  const { data: live } = await db().from("rounds").select("id, closes_at").eq("season", season).eq("status", "open").maybeSingle();
  if (!live?.closes_at || Date.parse(live.closes_at) <= Date.now()) throw new Error("Bidding is already closed.");
  const closes = seconds === "now" ? new Date().toISOString() : new Date(Date.parse(live.closes_at) + seconds * 1000).toISOString();
  const { error } = await db().from("rounds").update({ closes_at: closes }).eq("id", live.id);
  if (error) fail(error);
}

// Sign this round's winners and open the next round (or the last chance round, or finish).
export async function nextRound(team: Team) {
  await commish(team);
  const r = await room(team);
  if (r.phase !== "reveal" || !r.round || !r.reveal) throw new Error("Wait for the reveal first.");
  const { count } = await db().from("renounces").select("id", { count: "exact", head: true }).eq("round_id", r.round.id);
  const awards = r.reveal.flatMap((i) => (i.winner ? [{ player_id: i.playerId, team_id: i.winner.teamId, amount: i.winner.amount }] : []));
  await rpc("bidding_finalize", { p_round: r.round.id, p_awards: awards, p_result: r.reveal, p_renounces: count ?? 0, p_seconds: ROUND_SECONDS });
}

export async function lockContracts(team: Team, locked: boolean) {
  await commish(team);
  const { error } = await db().from("settings").update({ fa_locked: locked }).eq("id", 1);
  if (error) fail(error);
}

export async function restart(team: Team) {
  await commish(team);
  const { season } = await getSettings();
  await rpc("bidding_restart", { p_season: season });
}

// ---------- commissioner setup: which players go in which round ----------

// `signed`: players in the round who have since joined a team (a free agent pickup). They're skipped in the auction.
export type SetupRound = { number: number; id: string | null; status: string; players: CardPlayer[]; signed: string[] };

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
  const { data: rounds } = await db().from("rounds").select("id, number, status, kind, round_players(pos, player:players(*, contracts(active)))").eq("season", season).eq("kind", "regular").order("number");
  return Array.from({ length: REGULAR_ROUNDS }, (_, i) => {
    const r = rounds?.find((x) => x.number === i + 1);
    const rows = [...(r?.round_players ?? [])].sort((a, b) => a.pos - b.pos).map((x) => one(x.player)).filter((p) => !!p);
    // A finished round's signings are on teams too: only flag players in rounds still to come or live.
    const signed = r?.status === "final" ? [] : rows.filter((p) => p.contracts.some((c) => c.active)).map((p) => p.id);
    return { number: i + 1, id: r?.id ?? null, status: r?.status ?? "setup", players: rows.map(cardOf), signed };
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
  await commish(team);
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
  await commish(team);
  const { season } = await getSettings();
  const id = await roundRow(season, number);
  await db().from("round_players").delete().eq("round_id", id).eq("player_id", playerId);
  const { count } = await db().from("round_players").select("player_id", { count: "exact", head: true }).eq("round_id", id);
  if (!count) await db().from("rounds").delete().eq("id", id).eq("status", "setup");
}

// Fill every open spot in rounds 1-8 with the best free agents left, by last season's fantasy points per game.
export async function autoFill(team: Team) {
  await commish(team);
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
  await commish(team);
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
