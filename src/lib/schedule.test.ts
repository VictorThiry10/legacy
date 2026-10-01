import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, roundRobin, scoringWeeks, semifinalPairs, winner } from "./schedule";

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

test("season: two legs, then semis and a final over two weeks each", () => {
  const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const s = buildSchedule(teams, "2026-10-20");
  const regular = s.filter((m) => m.round === "regular");
  assert.equal(regular.length, 56); // 14 weeks x 4 games
  assert.equal(new Set(regular.map((m) => m.week)).size, 14);
  // every pair meets twice, once at each home
  const legs = new Map<string, number>();
  for (const m of regular) legs.set(`${m.home_team_id}>${m.away_team_id}`, (legs.get(`${m.home_team_id}>${m.away_team_id}`) ?? 0) + 1);
  assert.equal(legs.size, 56);
  const semis = s.filter((m) => m.round === "semi");
  const final = s.filter((m) => m.round === "final");
  assert.equal(semis.length, 2);
  assert.equal(final.length, 1);
  assert.deepEqual([semis[0].week, semis[0].starts, semis[0].ends], [15, "2027-01-25", "2027-02-07"]);
  assert.deepEqual([final[0].week, final[0].starts, final[0].ends], [17, "2027-02-08", "2027-02-21"]);
  assert.equal(semis[0].home_team_id, null);
});

test("playoffs: 1 v 4, 2 v 3; ties go to the higher seed", () => {
  assert.deepEqual(semifinalPairs(["s1", "s2", "s3", "s4", "s5"]), [["s1", "s4"], ["s2", "s3"]]);
  const m = { home_team_id: "s1", away_team_id: "s4" };
  assert.equal(winner(m, 100, 120), "s4");
  assert.equal(winner(m, 110, 110), "s1");
});
