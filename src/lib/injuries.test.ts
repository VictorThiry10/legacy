import { test } from "node:test";
import assert from "node:assert/strict";
import { injuryChanges, injuryMessage } from "./injuries";

const P = (id: string, name: string, injury_status: string | null) => ({ id, name, injury_status });
const R = (rows: [string, string, string | null][]) => new Map(rows.map(([id, status, note]) => [id, { status, note }]));

test("injuryChanges: hurt, ruled out, upgraded and cleared are changes; the same status is not", () => {
  const players = [P("1", "Trae Young", null), P("2", "Joel Embiid", "Day-To-Day"), P("3", "Kevin Durant", "Out"), P("4", "LeBron James", "Day-To-Day"), P("5", "Chet Holmgren", null), P("6", "RJ Barrett", "Out")];
  const report = R([["1", "Day-To-Day", "Ankle."], ["2", "Out", "Knee."], ["4", "day-to-day ", "Rest."], ["6", "Day-To-Day", null]]);
  assert.deepEqual(injuryChanges(players, report), [
    { playerId: "1", name: "Trae Young", from: null, to: "Day-To-Day", note: "Ankle." },
    { playerId: "2", name: "Joel Embiid", from: "Day-To-Day", to: "Out", note: "Knee." },
    { playerId: "3", name: "Kevin Durant", from: "Out", to: null, note: null },
    { playerId: "6", name: "RJ Barrett", from: "Out", to: "Day-To-Day", note: null },
  ]);
});

test("injuryChanges: a report that lost most of its players is ignored, not read as everyone cleared", () => {
  const players = Array.from({ length: 30 }, (_, i) => P(String(i), `Player ${i}`, i < 20 ? "Out" : null));
  assert.equal(injuryChanges(players, R([])), null);
  assert.equal(injuryChanges(players, R([["0", "Out", null], ["1", "Out", null]])), null);
  // half or more still listed: a normal report
  const ten = R(Array.from({ length: 10 }, (_, i): [string, string, null] => [String(i), "Out", null]));
  assert.equal(injuryChanges(players, ten)?.length, 10);
  // few injuries to begin with: an empty report is believable
  assert.equal(injuryChanges([P("1", "A", "Out"), P("2", "B", null)], R([]))?.length, 1);
});

test("injuryMessage: the status and ESPN's note, or cleared", () => {
  assert.deepEqual(injuryMessage({ playerId: "1", name: "Trae Young", from: null, to: "Out", note: " Ankle, no timetable. " }), { title: "Trae Young: Out", body: "Ankle, no timetable." });
  assert.deepEqual(injuryMessage({ playerId: "1", name: "Trae Young", from: "Out", to: null, note: null }), { title: "Trae Young is off the injury report", body: "Cleared to play." });
  const long = injuryMessage({ playerId: "1", name: "X", from: null, to: "Day-To-Day", note: "word ".repeat(60) });
  assert.ok(long.body.length <= 170 && long.body.endsWith("…"));
});
