import "server-only";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { getSettings } from "./league";
import { problemsFor, rosters, type RosterPlayer } from "./roster";
import { emailHtml, esc, sendMail } from "./mail";
import { money } from "./rules";
import { pickName, picksById, picksOf, type Pick } from "./picks";
import { notifyTeams } from "./push";
import { listed } from "./names";

// Trade offers between two GMs. The proposer picks players and rookie draft picks from both teams; the other GM
// accepts or declines. Accepting swaps the contracts and the picks in one database step. Only rule: both teams under
// the cap afterwards (picks cost nothing).
// Each step also sends a push (lib/push.ts): a new offer to the GM who decides, the answer to the GM who asked, a
// withdrawn offer to the GM who was deciding, and a completed trade to the rest of the league.

export type TradeSide = { teamId: string; contracts: string[]; picks?: string[] };

// The players behind a set of contract ids, checking they are still on that team.
async function pick(teamId: string, contractIds: string[]): Promise<RosterPlayer[]> {
  if (!contractIds.length) return [];
  const roster = await rosters([teamId]);
  const out = contractIds.map((id) => roster.find((p) => p.contract_id === id));
  if (out.some((p) => !p)) throw new Error("Some of those players are not on that team anymore.");
  return out as RosterPlayer[];
}

// The draft picks behind a set of ids, checking that team still holds them.
async function held(side: TradeSide, all: Pick[]): Promise<Pick[]> {
  const out = (side.picks ?? []).map((id) => all.find((p) => p.id === id && p.team_id === side.teamId));
  if (out.some((p) => !p)) throw new Error("Some of those draft picks have changed hands.");
  return out as Pick[];
}

// What both teams look like after the trade: players and picks moving, salary in/out, and anything that breaks the cap.
export async function preview(from: TradeSide, to: TradeSide) {
  if (from.teamId === to.teamId) throw new Error("Pick another team.");
  if (!to.contracts.length && !from.contracts.length && !to.picks?.length && !from.picks?.length) throw new Error("Pick at least one player or draft pick.");
  const anyPicks = !!from.picks?.length || !!to.picks?.length;
  const [give, get, picks] = await Promise.all([pick(from.teamId, from.contracts), pick(to.teamId, to.contracts), anyPicks ? picksOf([from.teamId, to.teamId]) : []]);
  const [givePicks, getPicks] = await Promise.all([held(from, picks), held(to, picks)]);
  const problems = await problemsFor(
    [
      { teamId: from.teamId, add: get, remove: from.contracts },
      { teamId: to.teamId, add: give, remove: to.contracts },
    ],
    true,
  );
  return { give, get, givePicks, getPicks, problems };
}

const list = (ps: RosterPlayer[], picks: Pick[]) =>
  [...ps.map((p) => `${esc(p.name)} (${money(p.salary)})`), ...picks.map((p) => `the ${esc(pickName(p))}`)].join(", ") || "nothing";

// A push's wording for one side of a trade: "Trae Young, Paolo Banchero and the 2027 pick".
const words = (ps: RosterPlayer[], picks: Pick[]) => listed([...ps.map((p) => p.name), ...picks.map((p) => `the ${pickName(p)}`)]);

async function teamsById(ids: string[]) {
  const { data } = await db().from("teams").select("id, name, manager_email").in("id", ids);
  return new Map((data ?? []).map((t) => [t.id, t]));
}

// Send an offer and email the other GM a summary with a green button to review it. `site` is the app's address.
export async function propose(from: TradeSide, to: TradeSide, site: string) {
  const { give, get, givePicks, getPicks, problems } = await preview(from, to);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  const { season } = await getSettings();
  const { data, error } = await db().from("trade_offers")
    .insert({ season, from_team: from.teamId, to_team: to.teamId, give: from.contracts, get: to.contracts, give_picks: from.picks ?? [], get_picks: to.picks ?? [] }).select("id").single();
  if (error) fail(error);
  const teams = await teamsById([from.teamId, to.teamId]);
  const sender = teams.get(from.teamId), receiver = teams.get(to.teamId);
  await notifyTeams([to.teamId], {
    title: `Trade offer from ${sender?.name ?? "a GM"}`,
    body: `You get ${words(give, givePicks)} for ${words(get, getPicks)}.`,
    url: `/offers/${data!.id}`, tag: `offer-${data!.id}`,
  });
  if (receiver?.manager_email) {
    await sendMail({
      to: receiver.manager_email,
      subject: `Trade offer from ${sender?.name ?? "a GM"}`,
      html: emailHtml({
        title: `${sender?.name ?? "A GM"} wants to trade`,
        lines: [`<b>You get:</b> ${list(give, givePicks)}`, `<b>You give:</b> ${list(get, getPicks)}`],
        button: { label: "Review trade", href: `${site}/offers/${data!.id}` },
      }),
    });
  }
}

export type OfferView = {
  id: string; status: string; mine: boolean; me: string; other: { id: string; name: string };
  give: RosterPlayer[]; get: RosterPlayer[]; givePicks: Pick[]; getPicks: Pick[]; // from the viewer's point of view
};

// One offer, as the viewer sees it (null if it isn't theirs).
export async function getOffer(id: string, teamId: string): Promise<OfferView | null> {
  const { data: o } = await db().from("trade_offers").select("*").eq("id", id).maybeSingle();
  if (!o || (o.from_team !== teamId && o.to_team !== teamId)) return null;
  const mine = o.from_team === teamId;
  const otherId = mine ? o.to_team : o.from_team;
  const [all, teams, held] = await Promise.all([rosters([o.from_team, o.to_team]), teamsById([otherId]), picksById([...o.give_picks, ...o.get_picks])]);
  // accepted offers have moved the contracts and picks already: look them up by id, whoever has them
  const players = (ids: string[]) => ids.map((c) => all.find((p) => p.contract_id === c)).filter((p): p is RosterPlayer => !!p);
  const picks = (ids: string[]) => held.filter((p) => ids.includes(p.id));
  return {
    id: o.id, status: o.status, mine, me: teamId,
    other: { id: otherId, name: teams.get(otherId)?.name ?? "?" },
    give: players(mine ? o.give : o.get), get: players(mine ? o.get : o.give),
    givePicks: picks(mine ? o.give_picks : o.get_picks), getPicks: picks(mine ? o.get_picks : o.give_picks),
  };
}

export type Offer = {
  id: string; mine: boolean; other: { id: string; name: string }; created_at: string;
  give: RosterPlayer[]; get: RosterPlayer[]; givePicks: Pick[]; getPicks: Pick[]; // from my point of view: what I send, what I receive
};

// Open offers sent or received by a team, with the players (from that team's point of view).
export async function openOffers(teamId: string): Promise<Offer[]> {
  const { data } = await db().from("trade_offers")
    .select("id, from_team, to_team, give, get, give_picks, get_picks, created_at, from:teams!trade_offers_from_team_fkey(id, name), to:teams!trade_offers_to_team_fkey(id, name)")
    .eq("status", "pending").or(`from_team.eq.${teamId},to_team.eq.${teamId}`).order("created_at", { ascending: false });
  if (!data?.length) return [];
  const teamIds = [...new Set(data.flatMap((o) => [o.from_team, o.to_team]))];
  const [all, held] = await Promise.all([rosters(teamIds), picksById(data.flatMap((o) => [...o.give_picks, ...o.get_picks]))]);
  const players = (ids: string[]) => ids.map((id) => all.find((p) => p.contract_id === id)).filter((p): p is RosterPlayer => !!p);
  const picks = (ids: string[]) => held.filter((p) => ids.includes(p.id));
  return data.map((o) => {
    const mine = o.from_team === teamId;
    return {
      id: o.id, mine, created_at: o.created_at,
      other: mine ? { id: o.to!.id, name: o.to!.name } : { id: o.from!.id, name: o.from!.name },
      give: players(mine ? o.give : o.get),
      get: players(mine ? o.get : o.give),
      givePicks: picks(mine ? o.give_picks : o.get_picks),
      getPicks: picks(mine ? o.get_picks : o.give_picks),
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
  const { give, get, givePicks, getPicks, problems } = await preview({ teamId: o.from_team, contracts: o.give, picks: o.give_picks }, { teamId: o.to_team, contracts: o.get, picks: o.get_picks });
  if (problems.length) throw new Error(`Can't go through anymore: ${problems.join("; ")}.`);
  const { season } = await getSettings();
  await rpc("trade_offer_accept", { p_offer: offerId, p_season: season });
  const teams = await teamsById([o.from_team, o.to_team]);
  const proposer = teams.get(o.from_team);
  const a = proposer?.name ?? "A team", b = teams.get(o.to_team)?.name ?? "a team";
  await notifyTeams([o.from_team], { title: `${b} accepted your trade`, body: `You get ${words(get, getPicks)} for ${words(give, givePicks)}.`, url: "/team", tag: `offer-${offerId}` });
  const { data: league } = await db().from("teams").select("id");
  await notifyTeams((league ?? []).map((t) => t.id).filter((id) => id !== o.from_team && id !== o.to_team), {
    title: `Trade: ${a} and ${b}`,
    body: `${a} get ${words(get, getPicks)}. ${b} get ${words(give, givePicks)}.`,
    url: "/league/moves",
  });
  if (proposer?.manager_email && site) {
    await sendMail({
      to: proposer.manager_email,
      subject: `${teams.get(o.to_team)?.name ?? "They"} accepted your trade`,
      html: emailHtml({ title: "Trade accepted", lines: [`${esc(teams.get(o.to_team)?.name ?? "The other team")} accepted your offer. Everything has moved.`], button: { label: "Open your team", href: `${site}/team` } }),
    });
  }
}

// Decline (the receiving team) or cancel (the sending team).
export async function close(offerId: string, teamId: string) {
  const o = await offer(offerId);
  const status = o.to_team === teamId ? "declined" : o.from_team === teamId ? "cancelled" : null;
  if (!status) throw new Error("Not your offer.");
  const view = await getOffer(offerId, o.from_team).catch(() => null); // the sender's point of view, for the push
  const { error } = await db().from("trade_offers").update({ status, decided_at: new Date().toISOString() }).eq("id", offerId).eq("status", "pending");
  if (error) fail(error);
  const teams = await teamsById([o.from_team, o.to_team]);
  if (status === "declined") {
    await notifyTeams([o.from_team], {
      title: `${teams.get(o.to_team)?.name ?? "They"} declined your trade offer`,
      body: view ? `You offered ${words(view.give, view.givePicks)} for ${words(view.get, view.getPicks)}.` : "",
      url: `/offers/${offerId}`, tag: `offer-${offerId}`,
    });
  } else {
    await notifyTeams([o.to_team], {
      title: `${teams.get(o.from_team)?.name ?? "They"} cancelled their trade offer`,
      body: view ? `They offered ${words(view.give, view.givePicks)} for ${words(view.get, view.getPicks)}.` : "",
      url: "/team", tag: `offer-${offerId}`,
    });
  }
}
