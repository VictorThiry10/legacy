// Turns raw ESPN responses into our own simple shapes. Pure functions: tested against real ESPN data.
import { fantasyPoints, SCORING, type Scoring, type StatLine } from "./rules";

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

export type Line = { playerId: string; teamId: string; gameId: string; played: boolean; min: number; stats: StatLine; points: number };

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
export function parseSummary(json: SummaryJson, w: Scoring = SCORING): { game: GameRow; lines: Line[] } {
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
      const min = played ? num(at(a.stats, "minutes")) : 0;
      lines.push({ playerId: id, teamId: team.team.id, gameId: game.id, played, min, stats, points: played ? fantasyPoints(stats, w) : 0 });
    }
  }
  return { game, lines };
}

// ---------- last season stat lines (one ESPN call for every player) ----------
export type SeasonLine = {
  season: number; gp: number; min: number; fgm: number; fga: number; reb: number; ast: number;
  stl: number; blk: number; to: number; tf: number; ej: number; pts: number;
  fpts: number; // our scoring, without the +1 win bonus (ESPN doesn't say which games a player's team won)
};

type ByAthlete = {
  requestedSeason?: { year?: number };
  categories: { name: string; names: string[] }[];
  athletes: { athlete: { id: string }; categories: { name: string; values: number[] }[] }[];
};

export function parseSeasonStats(json: ByAthlete, w: Scoring = SCORING): Map<string, SeasonLine> {
  const names = new Map(json.categories.map((c) => [c.name, c.names]));
  const out = new Map<string, SeasonLine>();
  for (const a of json.athletes) {
    const v = (cat: string, key: string) => {
      const i = names.get(cat)?.indexOf(key) ?? -1;
      const n = a.categories.find((c) => c.name === cat)?.values[i];
      return i < 0 || n == null || !Number.isFinite(n) ? 0 : Math.round(n);
    };
    const s = {
      pts: v("offensive", "points"), fgm: v("offensive", "fieldGoalsMade"), fga: v("offensive", "fieldGoalsAttempted"),
      reb: v("general", "rebounds"), ast: v("offensive", "assists"), stl: v("defensive", "steals"), blk: v("defensive", "blocks"),
      to: v("offensive", "turnovers"), tf: v("general", "technicalFouls"), ej: v("general", "ejections"), win: 0,
    };
    out.set(a.athlete.id, {
      season: json.requestedSeason?.year ?? 0, gp: v("general", "gamesPlayed"), min: v("general", "minutes"),
      fgm: s.fgm, fga: s.fga, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, to: s.to, tf: s.tf, ej: s.ej, pts: s.pts,
      fpts: fantasyPoints(s, w),
    });
  }
  return out;
}

// ---------- one player's page: latest note, outlook, ranks, headlines ----------
export type NewsItem = { headline: string; description: string | null; published: string | null; url: string | null; image?: string | null; athleteIds?: string[] };
export type Overview = {
  note: { headline: string; story: string | null; published: string | null } | null;
  outlook: string | null;
  rank: number | null;
  positionRank: number | null;
  rostered: number | null;
  news: NewsItem[];
};

type OverviewJson = {
  rotowire?: { headline?: string; story?: string; description?: string; published?: string };
  fantasy?: { draftRank?: string; positionRank?: string; percentOwned?: string; projection?: string };
  news?: { headline?: string; description?: string; published?: string; links?: { web?: { href?: string } } }[];
};

const num = (s?: string) => (s && Number.isFinite(Number(s)) ? Number(s) : null);

export function parseOverview(json: OverviewJson): Overview {
  const r = json.rotowire;
  return {
    note: r?.headline ? { headline: r.headline, story: r.story ?? null, published: r.published ?? null } : null,
    outlook: json.fantasy?.projection ?? null,
    rank: num(json.fantasy?.draftRank),
    positionRank: num(json.fantasy?.positionRank),
    rostered: num(json.fantasy?.percentOwned),
    news: (json.news ?? []).filter((n) => n.headline).slice(0, 6).map((n) => ({
      headline: n.headline!, description: n.description ?? null, published: n.published ?? null, url: n.links?.web?.href ?? null,
    })),
  };
}

// ---------- league news feed ----------
type NewsJson = {
  articles?: {
    headline?: string; description?: string; published?: string;
    links?: { web?: { href?: string } }; images?: { url?: string }[];
    categories?: { type?: string; athleteId?: number | string }[];
  }[];
};

export function parseNews(json: NewsJson): NewsItem[] {
  return (json.articles ?? []).filter((a) => a.headline).map((a) => ({
    headline: a.headline!,
    description: a.description ?? null,
    published: a.published ?? null,
    url: a.links?.web?.href ?? null,
    image: a.images?.[0]?.url ?? null,
    athleteIds: (a.categories ?? []).filter((c) => c.type === "athlete" && c.athleteId != null).map((c) => String(c.athleteId)),
  }));
}

// ---------- fantasy positions (PG, SG, SF, PF, C, with dual eligibility) ----------
// ESPN's roster feed only says G / F / C. ESPN's fantasy game lists every slot a player can fill.
const SLOT: Record<number, string> = { 0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C" };

export function parseEligibility(json: { id: number | string; eligibleSlots?: number[] }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of json) {
    const pos = (p.eligibleSlots ?? []).filter((s) => s in SLOT).sort((a, b) => a - b).map((s) => SLOT[s]);
    if (pos.length) out.set(String(p.id), pos.join(", "));
  }
  return out;
}
