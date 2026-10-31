import { test } from "node:test";
import assert from "node:assert/strict";
import { headToHead, playoffChances, streakOf, tabulate, type Played } from "./standings";

const g = (week: number, home: string, away: string, homePts: number, awayPts: number): Played => ({ week, home, away, homePts, awayPts });

test("standings: record, points for and against, streak, sorted by win% then points for", () => {
  const played = [g(1, "A", "B", 100, 90), g(1, "C", "D", 80, 80.5), g(2, "A", "C", 110, 70), g(2, "B", "D", 95, 60), g(3, "B", "A", 99, 98)];
  const t = tabulate(["A", "B", "C", "D"], played);
  assert.deepEqual(t.map((s) => s.teamId), ["A", "B", "D", "C"]);
  const a = t[0], b = t[1], d = t[2], c = t[3];
  assert.deepEqual([a.w, a.l, a.t, a.pf, a.pa, a.streak], [2, 1, 0, 308, 259, "L1"]);
  assert.deepEqual([b.w, b.l, b.streak], [2, 1, "W2"]);
  assert.deepEqual([d.w, d.l, d.streak, d.pf], [1, 1, "L1", 140.5]);
  assert.deepEqual([c.w, c.l, c.streak], [0, 2, "L2"]);
  // a week played out of order still counts in week order for the streak
  assert.equal(tabulate(["A", "B"], [g(2, "A", "B", 1, 2), g(1, "A", "B", 2, 1)])[0].streak, "L1");
});

test("streak: last result and how long it has run; ties count as their own run", () => {
  assert.equal(streakOf([]), "");
  assert.equal(streakOf(["W", "W", "L", "W", "W", "W"]), "W3");
  assert.equal(streakOf(["W", "T"]), "T1");
});

test("head to head: wins each way, ties skipped", () => {
  const played = [g(1, "A", "B", 100, 90), g(2, "B", "A", 100, 90), g(3, "A", "B", 50, 50), g(4, "A", "C", 1, 0), g(5, "B", "A", 80, 90)];
  assert.deepEqual(headToHead("A", "B", played), [2, 1]);
  assert.deepEqual(headToHead("B", "A", played), [1, 2]);
  assert.deepEqual(headToHead("A", "D", played), [0, 0]);
});

// a fixed random sequence, so the odds come out the same every run
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test("playoff chances: settled table gives 100 or 0; a team far ahead is near certain; chances add up to the spots", () => {
  const ids = ["A", "B", "C", "D"];
  const settled = [g(1, "A", "B", 100, 90), g(1, "C", "D", 80, 70)];
  const done = playoffChances(ids, settled, [], null, 2);
  assert.deepEqual([...done.values()], [100, 0, 100, 0]);
  // nothing played, nothing to play: an even share
  assert.deepEqual([...playoffChances(ids, [], [], null, 2).values()], [50, 50, 50, 50]);
  // A has won every week by a mile, D has lost every week by a mile, a week to go
  const played = [1, 2, 3, 4].flatMap((w) => [g(w, "A", "D", 1200, 800), g(w, "B", "C", 1000, 990)]);
  const odds = playoffChances(ids, played, [{ week: 5, home: "A", away: "B" }, { week: 5, home: "C", away: "D" }], null, 2, 500, seeded());
  assert.ok(odds.get("A")! >= 95, `A ${odds.get("A")}`);
  assert.ok(odds.get("D")! <= 5, `D ${odds.get("D")}`);
  const total = [...odds.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 200) <= 4, `total ${total}`);
  // by conference: the top two of each conference, so each conference's chances add up to 200
  const conf = playoffChances(ids, played, [{ week: 5, home: "A", away: "B" }], [["A", "C"], ["B", "D"]], 2, 200, seeded(3));
  assert.equal(conf.get("A")! + conf.get("C")!, 100);
  assert.equal(conf.get("B")! + conf.get("D")!, 100);
});
