import { test } from "node:test";
import assert from "node:assert/strict";
import { viewKey, views } from "./team-views";

test("views: labels, and unknown values fall back to this season", () => {
  assert.deepEqual(views("2026-10-20", 2026).map((v) => v.label), [
    "Tue, Oct 20 Stats", "7 Day Stats", "15 Day Stats", "30 Day Stats", "2026–27 Stats", "2025–26 Stats",
  ]);
  assert.equal(viewKey("30"), "30");
  assert.equal(viewKey("nonsense"), "season");
  assert.equal(viewKey(undefined), "season");
});
