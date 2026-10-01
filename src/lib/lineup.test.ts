import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLineup, canPlay, swap, type LineupPlayer, type LineupRow, freezeLineup } from "./lineup";
import { addDays, etDay } from "./dates";

const p = (id: string, position: string, injury_status: string | null = null): LineupPlayer => ({ id, position, injury_status });
const roster = [p("pg", "PG"), p("sg", "SG"), p("sf", "SF"), p("pf", "PF"), p("c", "C"), p("g", "G"), p("f", "F"),
  p("c2", "C"), p("pg2", "PG"), p("sf2", "SF"), p("pf2", "PF"), p("sg2", "SG"), p("hurt", "C", "Out")];
const slotOf = (rows: LineupRow[], id: string) => rows.find((r) => r.playerId === id)?.slot;

test("eligibility", () => {
  assert.ok(canPlay(p("x", "PG"), "G"));
  assert.ok(!canPlay(p("x", "PG"), "F"));
  assert.ok(canPlay(p("x", "G"), "SG"));
  assert.ok(canPlay(p("x", "C"), "UTIL2"));
  assert.ok(!canPlay(p("x", "C"), "IR"));
  assert.ok(canPlay(p("x", "C", "Out"), "IR"));
  assert.ok(!canPlay(p("x", "C", "Day-To-Day"), "IR"));
});

test("no save: fills starters by position in roster order, rest on the bench", () => {
  const rows = buildLineup([], roster);
  assert.equal(slotOf(rows, "pg"), "PG");
  assert.equal(slotOf(rows, "g"), "G");
  assert.equal(slotOf(rows, "c2"), "UTIL1");
  assert.equal(slotOf(rows, "pf2"), "BE1");
  assert.equal(slotOf(rows, "sg2"), "BE2");
  assert.equal(slotOf(rows, "hurt"), "BE3");
  assert.equal(rows.filter((r) => r.playerId).length, 13);
});

test("saved lineup is kept, dropped players vanish, new players go to the bench", () => {
  const rows = buildLineup([{ slot: "UTIL1", playerId: "pg" }, { slot: "PG", playerId: "gone" }], [p("pg", "PG"), p("new", "C")]);
  assert.equal(slotOf(rows, "pg"), "UTIL1");
  assert.equal(slotOf(rows, "new"), "BE1");
  assert.equal(rows.find((r) => r.slot === "PG")!.playerId, null);
});

test("swap checks both players fit", () => {
  const rows = buildLineup([], roster);
  const players = new Map(roster.map((x) => [x.id, x]));
  assert.equal(typeof swap(rows, "sg2", "C", players), "string");
  const moved = swap(rows, "sg2", "SG", players) as LineupRow[];
  assert.ok(Array.isArray(moved));
  assert.equal(slotOf(moved, "sg2"), "SG");
  assert.equal(slotOf(moved, "sg"), "BE2");
  assert.equal(typeof swap(rows, "c", "IR", players), "string");
  assert.ok(Array.isArray(swap(rows, "hurt", "IR", players)));
});

test("dates are US Eastern", () => {
  assert.equal(etDay("2026-10-21T02:30:00Z"), "2026-10-20");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("freeze: each player's slot locks at his tip-off", () => {
  const T = 1_000; // tip-off time
  const started = new Set(["a", "b", "x"]);
  const tip = (id: string) => (started.has(id) ? T : undefined);
  const row = (slot: string, playerId: string | null) => ({ slot, playerId });
  const frozen = [{ slot: "PG", playerId: "a" }, { slot: "BE1", playerId: "b" }, { slot: "SG", playerId: "c" }];
  const sort = (rs: { slot: string; playerId: string }[]) => [...rs].sort((p, q) => p.slot.localeCompare(q.slot));

  // first freeze of the day: as built
  assert.deepEqual(freezeLineup([row("PG", "a")], [], tip, null), [{ slot: "PG", playerId: "a" }]);

  // a save after tip-off can't move started players; unstarted ones follow the save
  assert.deepEqual(
    sort(freezeLineup([row("PG", "b"), row("BE1", "a"), row("SF", "c")], frozen, tip, T + 60)),
    sort([{ slot: "PG", playerId: "a" }, { slot: "BE1", playerId: "b" }, { slot: "SF", playerId: "c" }]),
  );

  // a move saved just before tip-off counts even if the last freeze was earlier
  assert.deepEqual(
    sort(freezeLineup([row("PG", "b"), row("BE1", "a"), row("SG", "c")], frozen, tip, T - 1)),
    sort([{ slot: "PG", playerId: "b" }, { slot: "BE1", playerId: "a" }, { slot: "SG", playerId: "c" }]),
  );

  // dropped after his game: his points stay; picked up after his game: sits out today
  assert.deepEqual(
    sort(freezeLineup([row("BE1", "b"), row("SG", "c"), row("PG", "x")], frozen, tip, T + 60)),
    sort([{ slot: "PG", playerId: "a" }, { slot: "BE1", playerId: "b" }, { slot: "SG", playerId: "c" }]),
  );
});
