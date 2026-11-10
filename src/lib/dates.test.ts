import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, openingDay } from "./dates";

test("how long ago, in words", () => {
  const now = Date.parse("2026-10-21T20:00:00Z");
  assert.equal(ago("2026-10-21T19:59:45Z", now), "just now");
  assert.equal(ago("2026-10-21T19:57:00Z", now), "3 min ago");
  assert.equal(ago("2026-10-21T18:00:00Z", now), "2 h ago");
  assert.equal(ago("2026-10-18T20:00:00Z", now), "3 days ago");
});

test("Team and Matchup open on last night until 13:00 London", () => {
  const at = (iso: string) => openingDay(new Date(iso));
  assert.equal(at("2026-11-10T02:00:00Z"), "2026-11-09"); // 2:00 London, the games are on: the Eastern day
  assert.equal(at("2026-11-10T07:00:00Z"), "2026-11-09"); // 7:00 London, a new Eastern day: still last night
  assert.equal(at("2026-11-10T12:59:00Z"), "2026-11-09");
  assert.equal(at("2026-11-10T13:00:00Z"), "2026-11-10");
  assert.equal(at("2026-11-10T23:30:00Z"), "2026-11-10");
  assert.equal(at("2027-04-05T11:30:00Z"), "2027-04-04"); // summer time: 12:30 London
  assert.equal(at("2027-04-05T12:00:00Z"), "2027-04-05"); // 13:00 London
  assert.equal(at("2026-11-01T12:30:00Z"), "2026-10-31"); // month edge
});
