import { test } from "node:test";
import assert from "node:assert/strict";
import { headToHead, streakOf, tabulate, type Played } from "./standings";

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
