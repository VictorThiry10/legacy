import { test } from "node:test";
import assert from "node:assert/strict";
import { ago } from "./dates";

test("how long ago, in words", () => {
  const now = Date.parse("2026-10-21T20:00:00Z");
  assert.equal(ago("2026-10-21T19:59:45Z", now), "just now");
  assert.equal(ago("2026-10-21T19:57:00Z", now), "3 min ago");
  assert.equal(ago("2026-10-21T18:00:00Z", now), "2 h ago");
  assert.equal(ago("2026-10-18T20:00:00Z", now), "3 days ago");
});
