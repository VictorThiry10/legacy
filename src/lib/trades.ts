import "server-only";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { getSettings } from "./league";
import { problemsFor, rosters, type RosterPlayer } from "./roster";
import { emailHtml, esc, sendMail } from "./mail";
import { money } from "./rules";

// Trade offers between two GMs. The proposer picks players from both rosters; the other GM accepts or declines.
// Accepting swaps the contracts in one database step. Only rule: both teams under the cap afterwards.

export type TradeSide = { teamId: string; contracts: string[] };

// The players behind a set of contract ids, checking they are still on that team.
async function pick(teamId: string, contractIds: string[]): Promise<RosterPlayer[]> {
  if (!contractIds.length) return [];
  const roster = await rosters([teamId]);
  const out = contractIds.map((id) => roster.find((p) => p.contract_id === id));
  if (out.some((p) => !p)) throw new Error("Some of those players are not on that team anymore.");
  return out as RosterPlayer[];
}

// What both teams look like after the trade: players moving, salary in/out, and anything that breaks the cap.
export async function preview(from: TradeSide, to: TradeSide) {
  if (from.teamId === to.teamId) throw new Error("Pick another team.");
  if (!to.contracts.length && !from.contracts.length) throw new Error("Pick at least one player.");
  const [give, get] = await Promise.all([pick(from.teamId, from.contracts), pick(to.teamId, to.contracts)]);
  const problems = await problemsFor(
    [
      { teamId: from.teamId, add: get, remove: from.contracts },
      { teamId: to.teamId, add: give, remove: to.contracts },
    ],
    true,
  );
  return { give, get, problems };
}

const list = (ps: RosterPlayer[]) => (ps.length ? ps.map((p) => `${esc(p.name)} (${money(p.salary)})`).join(", ") : "nobody");

async function teamsById(ids: string[]) {
  const { data } = await db().from("teams").select("id, name, manager_email").in("id", ids);
  return new Map((data ?? []).map((t) => [t.id, t]));
}

// Send an offer and email the other GM a summary with a green button to review it. `site` is the app's address.
export async function propose(from: TradeSide, to: TradeSide, site: string) {
  const { give, get, problems } = await preview(from, to);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  const { season } = await getSettings();
  const { data, error } = await db().from("trade_offers")
    .insert({ season, from_team: from.teamId, to_team: to.teamId, give: from.contracts, get: to.contracts }).select("id").single();
  if (error) fail(error);
  const teams = await teamsById([from.teamId, to.teamId]);
  const sender = teams.get(from.teamId), receiver = teams.get(to.teamId);
  if (receiver?.manager_email) {
    await sendMail({
      to: receiver.manager_email,
      subject: `Trade offer from ${sender?.name ?? "a GM"}`,
      html: emailHtml({
        title: `${sender?.name ?? "A GM"} wants to trade`,
        lines: [`<b>You get:</b> ${list(give)}`, `<b>You give:</b> ${list(get)}`],
        button: { label: "Review trade", href: `${site}/offers/${data!.id}` },
      }),
    });
  }
}

export type OfferView = {
  id: string; status: string; mine: boolean; me: string; other: { id: string; name: string };
  give: RosterPlayer[]; get: RosterPlayer[]; // from the viewer's point of view
};

// One offer, as the viewer sees it (null if it isn't theirs).
export async function getOffer(id: string, teamId: string): Promise<OfferView | null> {
  const { data: o } = await db().from("trade_offers").select("*").eq("id", id).maybeSingle();
  if (!o || (o.from_team !== teamId && o.to_team !== teamId)) return null;
  const mine = o.from_team === teamId;
  const otherId = mine ? o.to_team : o.from_team;
  const [all, teams] = await Promise.all([rosters([o.from_team, o.to_team]), teamsById([otherId])]);
  // accepted offers have moved the contracts already: look them up by id on either team
  const players = (ids: string[]) => ids.map((c) => all.find((p) => p.contract_id === c)).filter((p): p is RosterPlayer => !!p);
  return {
    id: o.id, status: o.status, mine, me: teamId,
    other: { id: otherId, name: teams.get(otherId)?.name ?? "?" },
    give: players(mine ? o.give : o.get), get: players(mine ? o.get : o.give),
  };
}

export type Offer = {
  id: string; mine: boolean; other: { id: string; name: string }; created_at: string;
  give: RosterPlayer[]; get: RosterPlayer[]; // from my point of view: what I send, what I receive
};

// Open offers sent or received by a team, with the players (from that team's point of view).
export async function openOffers(teamId: string): Promise<Offer[]> {
  const { data } = await db().from("trade_offers")
    .select("id, from_team, to_team, give, get, created_at, from:teams!trade_offers_from_team_fkey(id, name), to:teams!trade_offers_to_team_fkey(id, name)")
    .eq("status", "pending").or(`from_team.eq.${teamId},to_team.eq.${teamId}`).order("created_at", { ascending: false });
  if (!data?.length) return [];
  const teamIds = [...new Set(data.flatMap((o) => [o.from_team, o.to_team]))];
  const all = await rosters(teamIds);
  const players = (ids: string[]) => ids.map((id) => all.find((p) => p.contract_id === id)).filter((p): p is RosterPlayer => !!p);
  return data.map((o) => {
    const mine = o.from_team === teamId;
    return {
      id: o.id, mine, created_at: o.created_at,
      other: mine ? { id: o.to!.id, name: o.to!.name } : { id: o.from!.id, name: o.from!.name },
      give: players(mine ? o.give : o.get),
      get: players(mine ? o.get : o.give),
    };
  });
}

async function offer(id: string) {
  const { data } = await db().from("trade_offers").select("*").eq("id", id).maybeSingle();
  if (!data || data.status !== "pending") throw new Error("This offer is no longer open.");
  return data;
}

export async function accept(offerId: string, teamId: string, site?: string) {
  const o = await offer(offerId);
  if (o.to_team !== teamId) throw new Error("Only the other team can accept.");
  const { problems } = await preview({ teamId: o.from_team, contracts: o.give }, { teamId: o.to_team, contracts: o.get });
  if (problems.length) throw new Error(`Can't go through anymore: ${problems.join("; ")}.`);
  const { season } = await getSettings();
  await rpc("trade_offer_accept", { p_offer: offerId, p_season: season });
  const teams = await teamsById([o.from_team, o.to_team]);
  const proposer = teams.get(o.from_team);
  if (proposer?.manager_email && site) {
    await sendMail({
      to: proposer.manager_email,
      subject: `${teams.get(o.to_team)?.name ?? "They"} accepted your trade`,
      html: emailHtml({ title: "Trade accepted", lines: [`${esc(teams.get(o.to_team)?.name ?? "The other team")} accepted your offer. The players have moved.`], button: { label: "Open your team", href: `${site}/team` } }),
    });
  }
}

// Decline (the receiving team) or cancel (the sending team).
export async function close(offerId: string, teamId: string) {
  const o = await offer(offerId);
  const status = o.to_team === teamId ? "declined" : o.from_team === teamId ? "cancelled" : null;
  if (!status) throw new Error("Not your offer.");
  const { error } = await db().from("trade_offers").update({ status, decided_at: new Date().toISOString() }).eq("id", offerId).eq("status", "pending");
  if (error) fail(error);
}
