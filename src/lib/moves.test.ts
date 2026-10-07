import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, headline, type Move } from "./moves";

const M = 1_000_000;
const move = (o: Partial<Move>): Move => ({
  id: "t1", kind: "sign", created_at: "2026-10-07T10:00:00Z", group_id: null, note: null, salary: 4 * M, years: 4, via: "manual",
  team: "Thiros", team_id: "a", other_team: null, other_team_id: null, player: "Cameron Boozer", player_id: "p1", ...o,
});

test("each kind of move in words", () => {
  assert.equal(headline(move({ via: "rookie" })), "Thiros drafted Cameron Boozer");
  assert.equal(headline(move({ via: "extension" })), "Thiros extended Cameron Boozer");
  assert.equal(headline(move({ via: "free_agent" })), "Thiros picked up Cameron Boozer");
  assert.equal(headline(move({ via: "waiver" })), "Thiros claimed Cameron Boozer");
  assert.equal(headline(move({ via: "draft" })), "Thiros signed Cameron Boozer");
  assert.equal(headline(move({ kind: "release", note: "Dropped" })), "Thiros dropped Cameron Boozer");
  assert.equal(headline(move({ kind: "release", note: "" })), "Thiros released Cameron Boozer");
  assert.equal(headline(move({ kind: "trade", other_team: "Cancunistan" })), "Thiros got Cameron Boozer from Cancunistan");
  assert.equal(headline(move({ kind: "pick", player: "2027 pick (Thiros)", player_id: null, other_team: "Cancunistan" })), "Thiros got the 2027 pick (Thiros) from Cancunistan");
});

test("the contract as a detail", () => {
  assert.equal(describe(move({})).detail, "$4m, 4 yr");
  assert.equal(describe(move({ kind: "trade", other_team: "X" })).detail, "$4m");
  assert.equal(describe(move({ kind: "release" })).detail, null);
  assert.equal(describe(move({ salary: null, years: null })).detail, null);
});
