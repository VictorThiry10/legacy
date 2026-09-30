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
  assert.equal(l.min, 41);
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

// Real ESPN season totals, 2025-26 (trimmed to two players).
import { parseSeasonStats, parseOverview, parseNews } from "./espn-parse";
const season = parseSeasonStats(JSON.parse(readFileSync(new URL("./fixtures/byathlete-2026.json", import.meta.url), "utf8")));

test("season totals: Wembanyama 2025-26", () => {
  const w = season.get("5104157")!;
  assert.deepEqual(
    { gp: w.gp, min: w.min, pts: w.pts, fgm: w.fgm, fga: w.fga, reb: w.reb, ast: w.ast, stl: w.stl, blk: w.blk, to: w.to, tf: w.tf, ej: w.ej },
    { gp: 64, min: 1866, pts: 1600, fgm: 553, fga: 1080, reb: 736, ast: 199, stl: 66, blk: 197, to: 155, tf: 2, ej: 0 },
  );
  // 1600 + 553 - 527 + 736 + 298.5 + 165 + 492.5 - 232.5 - 2 = 3083.5
  assert.equal(w.fpts, 3083.5);
  assert.equal(w.season, 2026);
});

test("season totals: Doncic technicals count", () => {
  const l = season.get("3945274")!;
  assert.equal(l.tf, 17);
  // 2143 + 693 - 764 + 495 + 795 + 262.5 + 85 - 382.5 - 17 = 3310
  assert.equal(l.fpts, 3310);
});

test("player overview: note, outlook, ranks", () => {
  const o = parseOverview({
    rotowire: { headline: "Feeling good", story: "More detail", published: "Mon Sep 28 12:12:40 PDT 2026" },
    fantasy: { draftRank: "4", positionRank: "2", percentOwned: "99.92", projection: "Big year ahead." },
    news: [{ headline: "H1", description: "D1", published: "2026-09-28T21:29:27.000+00:00", links: { web: { href: "https://espn.com/x" } } }, { description: "no headline" }],
  });
  assert.equal(o.note?.headline, "Feeling good");
  assert.equal(o.rank, 4);
  assert.equal(o.rostered, 99.92);
  assert.equal(o.news.length, 1);
  assert.equal(o.news[0].url, "https://espn.com/x");
});

test("league news: athlete ids from categories", () => {
  const n = parseNews({ articles: [{ headline: "Ingram practices", categories: [{ type: "athlete", athleteId: 3913176 }, { type: "team" }] }] });
  assert.deepEqual(n[0].athleteIds, ["3913176"]);
});

test("fantasy positions: real ESPN eligibility slots", async () => {
  const { parseEligibility } = await import("./espn-parse");
  const m = parseEligibility([
    { id: 4594268, eligibleSlots: [1, 2, 5, 6, 7, 8, 10, 11, 12, 13] }, // Anthony Edwards
    { id: 5104157, eligibleSlots: [4, 9, 10, 11, 12, 13] }, // Victor Wembanyama
    { id: 3945274, eligibleSlots: [0, 5, 8, 11, 12, 13] }, // Luka Doncic
    { id: 1, eligibleSlots: [11, 12] }, // nothing real: left out
  ]);
  assert.equal(m.get("4594268"), "SG, SF");
  assert.equal(m.get("5104157"), "C");
  assert.equal(m.get("3945274"), "PG");
  assert.equal(m.has("1"), false);
});
