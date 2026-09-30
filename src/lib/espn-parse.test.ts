import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSummary, parseInjuries } from "./espn-parse";

// Real ESPN box score: Bucks 125, Nets 108 (Apr 10, 2026). E.J. Liddell ejected, double technical Wilson/Dieng.
const summary = JSON.parse(readFileSync(new URL("./fixtures/summary-401811034.json", import.meta.url), "utf8"));
const { game, lines } = parseSummary(summary);
const line = (id: string) => lines.find((l) => l.playerId === id)!;

test("game info", () => {
  assert.equal(game.final, true);
  assert.equal(game.home_team_id, "15");
  assert.equal(game.home_score, 125);
  assert.equal(lines.length, 23);
});

test("AJ Green: 35 pts, 11-18 FG, 5 reb, 4 ast, 2 stl, win", () => {
  const l = line("4397475");
  assert.deepEqual(l.stats, { pts: 35, fgm: 11, fga: 18, reb: 5, ast: 4, stl: 2, blk: 0, to: 0, tf: 0, ej: 0, win: 1 });
  // 35 + 11 - 7 + 5 + 6 + 5 + 0 - 0 + 1 = 56
  assert.equal(l.points, 56);
});

test("ejection comes from play by play (ESPN's ejected flag is unreliable)", () => {
  assert.equal(line("4432821").stats.ej, 1);
  assert.equal(line("4432821").stats.win, 0);
});

test("double technical counts for both players", () => {
  assert.equal(line("4431714").stats.tf, 1);
  assert.equal(line("4997526").stats.tf, 1);
});

test("did not play scores zero", () => {
  const l = line("4278067");
  assert.equal(l.played, false);
  assert.equal(l.points, 0);
});

test("injury report: player id pulled from profile link", () => {
  const rows = parseInjuries({
    injuries: [{ injuries: [{ status: "Out", shortComment: "Torn ACL", athlete: { links: [{ href: "https://www.espn.com/nba/player/_/id/5105571/henri-veesaar" }] }, details: { returnDate: "2027-07-01" } }] }],
  });
  assert.deepEqual(rows, [{ playerId: "5105571", status: "Out", note: "Torn ACL", returnDate: "2027-07-01" }]);
});
