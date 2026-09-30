import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, roundRobin, scoringWeeks } from "./schedule";

test("round robin: 8 teams, 7 rounds, everyone meets everyone once", () => {
  const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const rounds = roundRobin(teams);
  assert.equal(rounds.length, 7);
  const seen = new Set<string>();
  for (const r of rounds) {
    assert.equal(r.length, 4);
    assert.equal(new Set(r.flat()).size, 8); // nobody plays twice in a week
    for (const [x, y] of r) seen.add([x, y].sort().join());
  }
  assert.equal(seen.size, 28);
});

test("round robin: odd team count gives a bye", () => {
  const rounds = roundRobin(["a", "b", "c"]);
  assert.equal(rounds.length, 3);
  rounds.forEach((r) => assert.equal(r.length, 1));
});

test("scoring weeks: first week ends Sunday, then Monday to Sunday", () => {
  const w = scoringWeeks("2026-10-20", 3); // a Tuesday
  assert.deepEqual(w[0], { week: 1, starts: "2026-10-20", ends: "2026-10-25" });
  assert.deepEqual(w[1], { week: 2, starts: "2026-10-26", ends: "2026-11-01" });
  assert.equal(w[2].starts, "2026-11-02");
});

test("schedule repeats the cycle", () => {
  const s = buildSchedule(["a", "b", "c", "d"], "2026-10-19", 5);
  assert.equal(s.length, 10);
  assert.deepEqual(s.filter((m) => m.week === 4).map((m) => [m.home_team_id, m.away_team_id]),
    s.filter((m) => m.week === 1).map((m) => [m.home_team_id, m.away_team_id]));
});
