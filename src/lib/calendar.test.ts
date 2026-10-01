import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGrid, monthsBetween, monthTitle } from "./calendar";

test("months across a season", () => {
  const m = monthsBetween("2026-10-01", "2027-06-30");
  assert.equal(m.length, 9);
  assert.deepEqual(m[0], { year: 2026, month: 10 });
  assert.deepEqual(m[3], { year: 2027, month: 1 });
  assert.equal(monthTitle(m[0]), "October 2026");
});

test("October 2026 starts on a Thursday", () => {
  const g = monthGrid({ year: 2026, month: 10 });
  assert.deepEqual(g[0], [null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.equal(g.flat().filter(Boolean).length, 31);
  assert.equal(g[g.length - 1].includes("2026-10-31"), true);
});
