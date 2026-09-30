// Turns raw ESPN responses into our own simple shapes. Pure functions: tested against real ESPN data.
import { fantasyPoints, type StatLine } from "./rules";

// ESPN play type ids (checked against real games)
export const PLAY = { TECHNICAL: "35", DOUBLE_TECHNICAL: "30", DEFENSIVE_3_SECONDS: "29", EJECTION: "517" };

export type PlayerRow = {
  id: string; name: string; position: string | null; nba_team: string; nba_team_id: string;
  headshot: string | null; injury_status: string | null; espn_salary: number | null;
};

type RosterAthlete = {
  id: string; fullName: string; position?: { abbreviation?: string }; headshot?: { href?: string };
  injuries?: { status?: string }[]; contract?: { salary?: number };
};

export function parseRoster(json: { athletes?: RosterAthlete[] }, team: { id: string; abbreviation: string }): PlayerRow[] {
  return (json.athletes ?? []).map((a) => ({
    id: a.id,
    name: a.fullName,
    position: a.position?.abbreviation ?? null,
    nba_team: team.abbreviation,
    nba_team_id: team.id,
    headshot: a.headshot?.href ?? null,
    injury_status: a.injuries?.[0]?.status ?? null,
    espn_salary: a.contract?.salary ?? null,
  }));
}

export type InjuryRow = { playerId: string; status: string; note: string | null; returnDate: string | null };

type InjuryJson = {
  injuries?: {
    injuries?: {
      status?: string; shortComment?: string; date?: string;
      athlete?: { links?: { href?: string }[] };
      details?: { returnDate?: string };
    }[];
  }[];
};

// League injury report. ESPN doesn't give the player id directly: it's inside the player's profile link.
export function parseInjuries(json: InjuryJson): InjuryRow[] {
  const rows: InjuryRow[] = [];
  for (const team of json.injuries ?? []) {
    for (const i of team.injuries ?? []) {
      const href = (i.athlete?.links ?? []).map((l) => l.href ?? "").join(" ");
      const id = href.match(/\/id\/(\d+)/)?.[1];
      if (!id || !i.status) continue;
      rows.push({ playerId: id, status: i.status, note: i.shortComment ?? null, returnDate: i.details?.returnDate ?? null });
    }
  }
  return rows;
}

export type GameRow = {
  id: string; start: string; state: "pre" | "in" | "post"; final: boolean;
  home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null;
};

type Competition = {
  id: string; date: string;
  status: { type: { state: string; completed?: boolean } };
  competitors: { id: string; homeAway: string; winner?: boolean; score?: string | { value?: number } }[];
};

function gameFrom(c: Competition): GameRow {
  const home = c.competitors.find((x) => x.homeAway === "home")!;
  const away = c.competitors.find((x) => x.homeAway === "away")!;
  const score = (x: typeof home) => {
    const v = typeof x.score === "object" ? x.score?.value : x.score;
    return v === undefined || v === "" ? null : Number(v);
  };
  return {
    id: c.id,
    start: c.date,
    state: (c.status.type.state as GameRow["state"]) ?? "pre",
    final: !!c.status.type.completed,
    home_team_id: home.id,
    away_team_id: away.id,
    home_score: score(home),
    away_score: score(away),
  };
}

export function parseScoreboard(json: { events?: { competitions: Competition[] }[] }): GameRow[] {
  return (json.events ?? []).map((e) => gameFrom(e.competitions[0]));
}

export type Line = { playerId: string; teamId: string; gameId: string; played: boolean; stats: StatLine; points: number };

type SummaryJson = {
  header: { competitions: Competition[] };
  boxscore: {
    players?: {
      team: { id: string };
      statistics: { keys: string[]; athletes: { athlete: { id: string }; didNotPlay?: boolean; ejected?: boolean; stats: string[] }[] }[];
    }[];
  };
  plays?: { type?: { id?: string | number }; participants?: { athlete?: { id?: string } }[] }[];
};

// One game's box score -> one line per player with our fantasy points.
export function parseSummary(json: SummaryJson): { game: GameRow; lines: Line[] } {
  const game = gameFrom(json.header.competitions[0]);
  const winnerId = game.final ? json.header.competitions[0].competitors.find((c) => c.winner)?.id : undefined;

  const techs = new Map<string, number>();
  const ejected = new Set<string>();
  for (const p of json.plays ?? []) {
    const type = String(p.type?.id ?? "");
    const ids = (p.participants ?? []).map((x) => x.athlete?.id).filter(Boolean) as string[];
    if (type === PLAY.TECHNICAL || type === PLAY.DOUBLE_TECHNICAL) ids.forEach((id) => techs.set(id, (techs.get(id) ?? 0) + 1));
    if (type === PLAY.EJECTION) ids.slice(0, 1).forEach((id) => ejected.add(id));
  }

  const lines: Line[] = [];
  for (const team of json.boxscore.players ?? []) {
    const block = team.statistics[0];
    if (!block) continue;
    const at = (row: string[], key: string) => row[block.keys.indexOf(key)] ?? "0";
    const num = (s: string) => (Number.isFinite(parseInt(s, 10)) ? parseInt(s, 10) : 0);
    for (const a of block.athletes) {
      const id = a.athlete.id;
      const played = !a.didNotPlay && a.stats.length > 0;
      const [fgm, fga] = played ? at(a.stats, "fieldGoalsMade-fieldGoalsAttempted").split("-").map(num) : [0, 0];
      const stats: StatLine = played
        ? {
            pts: num(at(a.stats, "points")), fgm, fga,
            reb: num(at(a.stats, "rebounds")), ast: num(at(a.stats, "assists")),
            stl: num(at(a.stats, "steals")), blk: num(at(a.stats, "blocks")), to: num(at(a.stats, "turnovers")),
            tf: techs.get(id) ?? 0, ej: ejected.has(id) || a.ejected ? 1 : 0,
            win: winnerId === team.team.id ? 1 : 0,
          }
        : { pts: 0, fgm: 0, fga: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tf: 0, ej: 0, win: 0 };
      lines.push({ playerId: id, teamId: team.team.id, gameId: game.id, played, stats, points: played ? fantasyPoints(stats) : 0 });
    }
  }
  return { game, lines };
}
