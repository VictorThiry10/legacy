import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, conferenceGroups, conferenceRounds, rehearsalSchedule, roundRobin, scoringWeeks, semifinalPairs, winner } from "./schedule";

test("round robin: 8 teams, 7 rounds, everyone meets everyone once", () => {
  const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const rounds = roundRobin(teams);
  assert.equal(rounds.length, 7);
  const seen = new Set<string>();
  for (const r of rounds) {
    assert.equal(r.length, 4);
    assert.equal(new Set(r.flat()).size, 8); // nobody plays twice in a week
    for (const [x, y] of r) seen.add([x, y].sort().join());
  }
  assert.equal(seen.size, 28);
});

test("round robin: odd team count gives a bye", () => {
  const rounds = roundRobin(["a", "b", "c"]);
  assert.equal(rounds.length, 3);
  rounds.forEach((r) => assert.equal(r.length, 1));
});

test("scoring weeks: first week ends Sunday, then Monday to Sunday", () => {
  const w = scoringWeeks("2026-10-20", 3); // a Tuesday
  assert.deepEqual(w[0], { week: 1, starts: "2026-10-20", ends: "2026-10-25" });
  assert.deepEqual(w[1], { week: 2, starts: "2026-10-26", ends: "2026-11-01" });
  assert.equal(w[2].starts, "2026-11-02");
});

test("season: two legs, then semis and a final over two weeks each", () => {
  const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const s = buildSchedule(teams, "2026-10-20");
  const regular = s.filter((m) => m.round === "regular");
  assert.equal(regular.length, 56); // 14 weeks x 4 games
  assert.equal(new Set(regular.map((m) => m.week)).size, 14);
  // every pair meets twice, once at each home
  const legs = new Map<string, number>();
  for (const m of regular) legs.set(`${m.home_team_id}>${m.away_team_id}`, (legs.get(`${m.home_team_id}>${m.away_team_id}`) ?? 0) + 1);
  assert.equal(legs.size, 56);
  const semis = s.filter((m) => m.round === "semi");
  const final = s.filter((m) => m.round === "final");
  assert.equal(semis.length, 2);
  assert.equal(final.length, 1);
  assert.deepEqual([semis[0].week, semis[0].starts, semis[0].ends], [15, "2027-01-25", "2027-02-07"]);
  assert.deepEqual([final[0].week, final[0].starts, final[0].ends], [17, "2027-02-08", "2027-02-21"]);
  assert.equal(semis[0].home_team_id, null);
});

test("conferences: rivals three times, the other conference once plus one more, 14 full weeks", () => {
  const paris = ["p1", "p2", "p3", "p4"], london = ["l1", "l2", "l3", "l4"];
  const weeks = conferenceRounds(paris, london);
  assert.equal(weeks.length, 14);
  const games = new Map<string, number>();
  const homes = new Map<string, number>();
  for (const w of weeks) {
    assert.equal(w.length, 4);
    assert.equal(new Set(w.flat()).size, 8); // everybody plays every week, once
    for (const [h, a] of w) {
      games.set([h, a].sort().join(), (games.get([h, a].sort().join()) ?? 0) + 1);
      homes.set(h, (homes.get(h) ?? 0) + 1);
    }
  }
  const same = (x: string, y: string) => x[0] === y[0];
  let twice = 0;
  for (const [pair, n] of games) {
    const [x, y] = pair.split(",");
    if (same(x, y)) assert.equal(n, 3, `${pair} should meet three times`);
    else {
      assert.ok(n === 1 || n === 2, `${pair} should meet once or twice`);
      if (n === 2) twice++;
    }
  }
  assert.equal(twice, 4); // one extra across game per team
  const played = new Map<string, number>();
  for (const w of weeks) for (const t of w.flat()) played.set(t, (played.get(t) ?? 0) + 1);
  for (const t of [...paris, ...london]) {
    assert.equal(played.get(t), 14);
    assert.ok((homes.get(t) ?? 0) >= 5); // homes can't come out even: nine conference games each
  }
  // the weeks alternate: two within the conference, one across
  assert.equal(same(...weeks[0][0]), true);
  assert.equal(same(...weeks[2][0]), false);

  // built into a season through buildSchedule, from each team's conference
  const conf = (id: string) => (id[0] === "p" ? "paris" : "london");
  const s = buildSchedule([...paris, ...london], "2026-10-19", conf);
  assert.equal(s.filter((m) => m.round === "regular").length, 56);
  assert.equal(s.filter((m) => m.round === "semi").length, 2);
  // teams without conferences, or uneven ones, fall back to two legs
  assert.equal(conferenceGroups(["a", "b", "c", "d"], () => null), null);
  assert.equal(conferenceGroups(["a", "b", "c", "d"], (id) => (id === "a" ? "x" : "y")), null);
  assert.deepEqual(conferenceGroups(["a", "b", "c", "d"], (id) => ("ab".includes(id) ? "y" : "x")), [["c", "d"], ["a", "b"]]);
});

test("playoffs: 1 v 4, 2 v 3; ties go to the higher seed", () => {
  assert.deepEqual(semifinalPairs(["s1", "s2", "s3", "s4", "s5"]), [["s1", "s4"], ["s2", "s3"]]);
  const m = { home_team_id: "s1", away_team_id: "s4" };
  assert.equal(winner(m, 100, 120), "s4");
  assert.equal(winner(m, 110, 110), "s1");
});

test("preseason rehearsal: two regular weeks, semis, final inside the preseason", () => {
  const rows = rehearsalSchedule(["a", "b", "c", "d"], "2026-10-03", "2026-10-16");
  const phases = [...new Map(rows.map((r) => [r.week, `${r.round} ${r.starts} ${r.ends}`])).values()];
  assert.deepEqual(phases, [
    "regular 2026-10-03 2026-10-05",
    "regular 2026-10-06 2026-10-09",
    "semi 2026-10-10 2026-10-12",
    "final 2026-10-13 2026-10-16",
  ]);
  assert.equal(rows.filter((r) => r.round === "regular").length, 4); // 2 games a week, 4 teams
  const met = rows.filter((r) => r.round === "regular").map((r) => [r.home_team_id, r.away_team_id].sort().join());
  assert.equal(new Set(met).size, 4); // nobody meets twice
});
