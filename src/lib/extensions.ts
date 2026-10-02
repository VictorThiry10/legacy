import "server-only";
import { cache } from "react";
import { db } from "./supabase/server";
import { rpc } from "./db";
import { getSettings, type Team } from "./league";
import { capSpaces, problemsFor, rosters } from "./roster";
import { onIR } from "./lineup-store";
import { money } from "./rules";

// Contract extensions, a one-off. Each GM can keep any of the players whose contract ran out with last season
// (2025-26), for 1 more year at last season's salary. Rosters and salaries are from the Legacy_Draft Google sheet
// (each GM's own tab, the 25-26 column, players with nothing in 26-27). GMs see a pop-up once, until they decide.

const VICTOR = "95b613dc-64b6-4d2f-8774-ba38fa257b60";
const NATHAN = "0fd155b1-6b98-4888-95ca-4c51f4a7d383";
const ILAN = "3801e216-2d94-4a2f-8127-d93f23349271";
const AWAD = "9e6068c5-bed0-4056-b4c7-33a6bc30f26f";

// Who gets the pop-up. Victor tests it first; add NATHAN, ILAN and AWAD to open it to everyone.
const OPEN_TO = new Set([VICTOR]);

const M = 1_000_000;
// ESPN player id -> last season's salary, per team.
const EXPIRED: Record<string, Record<string, number>> = {
  [VICTOR]: {
    "4277961": 2 * M, // Jaren Jackson Jr.
    "4395725": 5 * M, // Tyler Herro
    "4397688": 3 * M, // Trey Murphy III
    "4683021": 4 * M, // Deni Avdija
    "4711294": 1 * M, // Matas Buzelis
    "2595516": 1 * M, // Norman Powell
    "4433083": 2 * M, // Cam Spencer
  },
  [NATHAN]: {
    "4278104": 6 * M, // Michael Porter Jr.
    "4712849": 1 * M, // Anthony Black
    "6450": 4 * M, // Kawhi Leonard
    "3064514": 3 * M, // Julius Randle
    "4683766": 1 * M, // Isaiah Collier
    "3062679": 1 * M, // Josh Hart
    "4066354": 1 * M, // Payton Pritchard
    "4683692": 3 * M, // Cason Wallace
  },
  [ILAN]: {
    "4066383": 5 * M, // Miles Bridges
    "3147657": 6 * M, // Mikal Bridges
    "4576087": 2 * M, // Peyton Watson
    "4278129": 6 * M, // Deandre Ayton
    "4869780": 3 * M, // Derik Queen
    "4278039": 2 * M, // Nickeil Alexander-Walker
    "5160992": 3 * M, // Alex Sarr
  },
  [AWAD]: {
    "3975": 16 * M, // Stephen Curry
    "4066328": 16 * M, // Jarrett Allen
    "3078576": 13 * M, // Derrick White
    "4278049": 1 * M, // Daniel Gafford
    "4431767": 1 * M, // Christian Braun
    "4845367": 1 * M, // Stephon Castle
    "4396971": 1 * M, // Naz Reid
    "4432848": 1 * M, // Jaime Jaquez Jr.
    "5061575": 1 * M, // Kon Knueppel
  },
};

export type ExtensionPlayer = {
  id: string; name: string; position: string | null; nbaTeam: string | null; headshot: string | null; salary: number;
  taken: string | null; // why he can't be extended: signed since, or on waivers
};
export type ExtensionOffer = { players: ExtensionPlayer[]; capSpace: number; rosterCount: number; rosterMax: number };

// The pop-up for this team, or null: not open to it, nothing to extend, or already decided.
// Read once per page: the layout's pop-up and the Team page's to-do row both ask.
export const extensionOffer = (team: Team) => offerFor(team.id);

const offerFor = cache(async (teamId: string): Promise<ExtensionOffer | null> => {
  const expired = EXPIRED[teamId];
  if (!OPEN_TO.has(teamId) || !expired) return null;
  const { data: done } = await db().from("extension_decisions").select("team_id").eq("team_id", teamId).maybeSingle();
  if (done) return null;
  const ids = Object.keys(expired);
  const [{ data: players }, { data: signed }, { data: waived }, roster, ir, space, { rules }] = await Promise.all([
    db().from("players").select("id, name, position, nba_team, headshot").in("id", ids),
    db().from("contracts").select("player_id, team_id, team:teams(name)").in("player_id", ids).eq("active", true),
    db().from("waivers").select("player_id").in("player_id", ids).eq("status", "open"),
    rosters([teamId]),
    onIR([teamId]),
    capSpaces([teamId]),
    getSettings(),
  ]);
  const taken = (id: string) => {
    const c = signed?.find((s) => s.player_id === id);
    if (c) return c.team_id === teamId ? "Already on your team" : `Signed by ${c.team?.name ?? "another team"}`;
    return waived?.some((w) => w.player_id === id) ? "On waivers" : null;
  };
  return {
    players: (players ?? [])
      .map((p) => ({ id: p.id, name: p.name, position: p.position, nbaTeam: p.nba_team, headshot: p.headshot, salary: expired[p.id], taken: taken(p.id) }))
      .sort((a, b) => b.salary - a.salary || a.name.localeCompare(b.name)),
    capSpace: space.get(teamId) ?? 0,
    rosterCount: roster.filter((p) => !ir.has(p.id)).length, // IR doesn't take a roster spot
    rosterMax: rules.rosterMax,
  };
});

// Extend the chosen players (none is fine: that's a decision too). Checked against the cap and roster size first.
export async function extend(team: Team, playerIds: string[]) {
  const expired = EXPIRED[team.id];
  if (!OPEN_TO.has(team.id) || !expired) throw new Error("Extensions aren't open for your team.");
  const ids = [...new Set(playerIds)];
  if (ids.some((id) => !(id in expired))) throw new Error("You can only extend your own players from last season.");
  const { season } = await getSettings();
  const rows = ids.map((id) => ({ player: id, salary: expired[id] }));
  const problems = await problemsFor([{ teamId: team.id, add: rows.map((r) => ({ player_id: r.player, salary: r.salary, years: 1, season_signed: season })), remove: [] }]);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  await rpc("extensions_decide", { p_team: team.id, p_season: season, p_rows: rows, p_note: "Contract extension, last season's salary" });
  const total = rows.reduce((a, r) => a + r.salary, 0);
  return ids.length ? `Extended ${ids.length} player${ids.length > 1 ? "s" : ""} for ${money(total)}.` : "No extensions. You're all set.";
}
