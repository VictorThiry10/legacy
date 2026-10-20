import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLineup, type LineupPlayer, type LineupRow } from "./lineup";
import { quickLineup } from "./quick-lineup";

const p = (id: string, position: string, injury_status: string | null = null): LineupPlayer => ({ id, position, injury_status });
const slotOf = (rows: LineupRow[], id: string) => rows.find((r) => r.playerId === id)?.slot;
const starts = (rows: LineupRow[], id: string) => { const s = slotOf(rows, id); return !!s && !s.startsWith("BE") && s !== "IR"; };
const run = (roster: LineupPlayer[], value: Record<string, number>, o: { plays?: string[]; locked?: string[]; rows?: LineupRow[] } = {}) =>
  quickLineup(o.rows ?? buildLineup([], roster), new Map(roster.map((x) => [x.id, x])), {
    value: (id) => value[id] ?? 0,
    plays: (id) => !o.plays || o.plays.includes(id),
    locked: (id) => !!o.locked?.includes(id),
  });

test("the most valuable players with a game start, the rest sit in value order", () => {
  const roster = [p("a", "PG"), p("b", "SG"), p("c", "SF"), p("d", "PF"), p("e", "C"), p("f", "G"), p("g", "F"),
    p("h", "C"), p("i", "PG"), p("j", "SF"), p("k", "PF"), p("l", "SG"), p("m", "C")];
  const value = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10, k: 11, l: 12, m: 13 };
  const rows = run(roster, value);
  for (const id of ["m", "l", "k", "j", "i", "h", "g", "f", "e", "d"]) assert.ok(starts(rows, id), id);
  assert.equal(slotOf(rows, "c"), "BE1");
  assert.equal(slotOf(rows, "b"), "BE2");
  assert.equal(slotOf(rows, "a"), "BE3");
  assert.equal(rows.filter((r) => r.playerId).length, 13);
  assert.equal(slotOf(rows, "m"), "C"); // the specific slot before UTIL
});

test("no game or out: benched behind anyone who plays", () => {
  const roster = [p("star", "PG"), p("hurt", "SG", "Out"), p("ok", "SG"), p("sub", "PG")];
  const rows = run(roster, { star: 50, hurt: 40, ok: 10, sub: 5 }, { plays: ["hurt", "ok", "sub"] });
  assert.ok(starts(rows, "ok"));
  assert.ok(starts(rows, "sub"));
  assert.ok(starts(rows, "star")); // no game, but an open slot is better than an empty one
  assert.ok(starts(rows, "hurt"));
  assert.equal(slotOf(rows, "ok"), "SG");
  assert.equal(slotOf(rows, "sub"), "PG");
});

test("locked players and IR stay put", () => {
  const roster = [p("a", "PG"), p("b", "PG"), p("c", "C"), p("ir", "C", "Out")];
  const rows = buildLineup([{ slot: "BE1", playerId: "a" }, { slot: "UTIL2", playerId: "b" }, { slot: "IR", playerId: "ir" }], roster);
  const next = run(roster, { a: 100, b: 1, c: 50, ir: 99 }, { rows, locked: ["a", "b"] });
  assert.equal(slotOf(next, "a"), "BE1"); // locked on the bench, even if he's the best
  assert.equal(slotOf(next, "b"), "UTIL2");
  assert.equal(slotOf(next, "ir"), "IR");
  assert.equal(slotOf(next, "c"), "C");
});

test("re-routes earlier picks so the best set fits the slots", () => {
  // only PG, SG and G are open: a first-fit greedy would put the G at PG, the first PG at G and bench the second PG
  const fill = ["SF", "PF", "C", "F", "UTIL1", "UTIL2", "UTIL3"].map((s, i) => ({ slot: s, playerId: `x${i}` }));
  const roster = [...fill.map((f) => p(f.playerId!, "C")), p("g", "G"), p("pg1", "PG"), p("pg2", "PG"), p("sg", "SG")];
  const rows = buildLineup(fill as { slot: string; playerId: string }[], roster);
  const next = run(roster, { g: 100, pg1: 90, pg2: 85, sg: 10 }, { rows, locked: fill.map((f) => f.playerId!) });
  assert.ok(starts(next, "g"));
  assert.ok(starts(next, "pg1"));
  assert.ok(starts(next, "pg2"));
  assert.equal(slotOf(next, "sg"), "BE1");
});

test("more players than slots: the extras come back as bench rows", () => {
  const roster = Array.from({ length: 15 }, (_, i) => p(`p${i}`, "PG, SG, SF, PF, C"));
  const rows = run(roster, Object.fromEntries(roster.map((x, i) => [x.id, i])));
  assert.equal(rows.filter((r) => r.playerId).length, 15);
  assert.equal(rows.filter((r) => r.slot === "BE").length, 2);
  assert.equal(rows[rows.length - 1].slot, "IR");
});
