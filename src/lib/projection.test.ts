import { test } from "node:test";
import assert from "node:assert/strict";
import { perGame } from "./projection";
import type { SeasonLine } from "./espn-parse";

const line = (gp: number, fpts: number): SeasonLine => ({ season: 2026, gp, fpts, min: 0, fgm: 0, fga: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tf: 0, ej: 0, pts: 0 });

test("projection per game: ESPN's projection first, last season as the fallback, nothing for a blank", () => {
  assert.equal(perGame({ projection: line(82, 3280), last_season: line(70, 2100) }), 40);
  assert.equal(perGame({ projection: line(0, 0), last_season: line(70, 2135) }), 30.5);
  assert.equal(perGame({ projection: null, last_season: null }), null);
  assert.equal(perGame(undefined), null);
});
