// Projected fantasy points: ESPN's projection for this season, else last season, per game. Pure, tested.
import type { SeasonLine } from "./espn-parse";

export type Projectable = { projection?: SeasonLine | null; last_season?: SeasonLine | null };

// Per game, or null when there is nothing to go on (a rookie ESPN hasn't projected).
export function perGame(p: Projectable | undefined | null): number | null {
  const s = p?.projection?.gp ? p.projection : p?.last_season?.gp ? p.last_season : null;
  return s ? Math.round((s.fpts / s.gp) * 10) / 10 : null;
}

// Point to the first decimal.
export const round1 = (n: number) => Math.round(n * 10) / 10;
