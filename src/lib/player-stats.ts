import type { SeasonLine } from "./espn-parse";

// Columns of the Players table, in order. "key" is how the column sorts.
export const STAT_COLS = [
  { key: "gp", label: "GP", title: "Games played" },
  { key: "min", label: "MIN", title: "Minutes" },
  { key: "fgm", label: "FGM", title: "Field goals made" },
  { key: "fgmi", label: "FGMI", title: "Field goals missed" },
  { key: "reb", label: "REB", title: "Rebounds" },
  { key: "ast", label: "AST", title: "Assists" },
  { key: "stl", label: "STL", title: "Steals" },
  { key: "blk", label: "BLK", title: "Blocks" },
  { key: "to", label: "TO", title: "Turnovers" },
  { key: "tf", label: "TF", title: "Technical fouls" },
  { key: "ej", label: "EJ", title: "Ejections" },
  { key: "pts", label: "PTS", title: "Points" },
] as const;

export type StatKey = (typeof STAT_COLS)[number]["key"] | "tot" | "avg";

// One number from a season line, as a total or per game.
export function stat(s: SeasonLine | null | undefined, key: StatKey, perGame: boolean): number | null {
  if (!s || !s.gp) return null;
  if (key === "gp") return s.gp;
  if (key === "tot") return s.fpts;
  if (key === "avg") return s.fpts / s.gp;
  const raw = key === "fgmi" ? s.fga - s.fgm : s[key];
  return perGame ? raw / s.gp : raw;
}

export function fmt(n: number | null, perGame: boolean, key: StatKey) {
  if (n == null) return "–";
  if (key === "gp") return String(n);
  return perGame || key === "avg" || key === "tot" ? n.toFixed(1) : String(Math.round(n));
}

// "2026" (ESPN's name, the year the season ends) -> "2025–26"
export const seasonLabel = (espnYear: number) => `${espnYear - 1}–${String(espnYear).slice(2)}`;
