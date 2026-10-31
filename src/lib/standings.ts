// The standings table from finished matchups. Pure, tested.

export type Standing = { teamId: string; w: number; l: number; t: number; pf: number; pa: number; streak: string }; // streak: "W3", "L1", "" before a result
export type Played = { week: number; home: string; away: string; homePts: number; awayPts: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

// Wins, losses, points for and against, and the current streak, best team first: win% (a tie is half a win),
// then points for.
export function tabulate(teamIds: string[], played: Played[]): Standing[] {
  const table = new Map(teamIds.map((id) => [id, { teamId: id, w: 0, l: 0, t: 0, pf: 0, pa: 0, streak: "" }]));
  const results = new Map<string, ("W" | "L" | "T")[]>(teamIds.map((id) => [id, []]));
  for (const m of [...played].sort((a, b) => a.week - b.week)) {
    const h = table.get(m.home), a = table.get(m.away);
    if (!h || !a) continue;
    h.pf = round1(h.pf + m.homePts); h.pa = round1(h.pa + m.awayPts); a.pf = round1(a.pf + m.awayPts); a.pa = round1(a.pa + m.homePts);
    const [rh, ra]: ("W" | "L" | "T")[] = m.homePts > m.awayPts ? ["W", "L"] : m.awayPts > m.homePts ? ["L", "W"] : ["T", "T"];
    if (rh === "W") { h.w++; a.l++; } else if (rh === "L") { a.w++; h.l++; } else { h.t++; a.t++; }
    results.get(m.home)!.push(rh);
    results.get(m.away)!.push(ra);
  }
  for (const s of table.values()) s.streak = streakOf(results.get(s.teamId) ?? []);
  return [...table.values()].sort((x, y) => y.w + y.t / 2 - (x.w + x.t / 2) || y.pf - x.pf);
}

// "W3": the last result and how many in a row it has been.
export function streakOf(results: ("W" | "L" | "T")[]): string {
  if (!results.length) return "";
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  return `${last}${n}`;
}

// Head to head between two teams over finished matchups: [a's wins, b's wins].
export function headToHead(a: string, b: string, played: Played[]): [number, number] {
  let wa = 0, wb = 0;
  for (const m of played) {
    const pair = (m.home === a && m.away === b) || (m.home === b && m.away === a);
    if (!pair || m.homePts === m.awayPts) continue;
    const winner = m.homePts > m.awayPts ? m.home : m.away;
    if (winner === a) wa++; else wb++;
  }
  return [wa, wb];
}

export type Upcoming = { week: number; home: string; away: string };

// Each team's chance of making the playoffs, in % (0 to 100). The weeks still to play are played out many times
// (`sims`): a team scores a week's points drawn around its average so far, pulled a little towards the league's
// (two weeks' worth, so early weeks don't swing it), spread by the league's week to week spread; the table is then
// made as the real one is (tabulate), and the top `spots` go through: by conference (`groups`, the top half of the
// spots in each) when the league has them, else overall. With nothing left to play the table decides: 100 or 0.
export function playoffChances(teamIds: string[], played: Played[], upcoming: Upcoming[], groups: string[][] | null, spots = 4, sims = 2000, rand = Math.random): Map<string, number> {
  const through = (table: Standing[]) => {
    const ids = table.map((s) => s.teamId);
    return groups ? groups.flatMap((g) => ids.filter((id) => g.includes(id)).slice(0, spots / groups.length)) : ids.slice(0, spots);
  };
  const out = new Map(teamIds.map((id) => [id, 0]));
  if (!upcoming.length) {
    if (played.length) for (const id of through(tabulate(teamIds, played))) out.set(id, 100);
    else for (const id of teamIds) out.set(id, Math.round((100 * spots) / Math.max(1, teamIds.length)));
    return out;
  }
  // every week's points, by team
  const weeks = new Map<string, number[]>(teamIds.map((id) => [id, []]));
  for (const m of played) {
    weeks.get(m.home)?.push(m.homePts);
    weeks.get(m.away)?.push(m.awayPts);
  }
  const all = [...weeks.values()].flat();
  const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 1000;
  const spread = all.length > 1 ? Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / (all.length - 1)) : mean * 0.15;
  const sd = Math.max(spread, mean * 0.05);
  const expected = new Map(teamIds.map((id) => {
    const w = weeks.get(id)!;
    return [id, (w.reduce((a, b) => a + b, 0) + mean * 2) / (w.length + 2)];
  }));
  // a normal draw (Box-Muller)
  const draw = (m: number) => m + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const made = new Map(teamIds.map((id) => [id, 0]));
  for (let k = 0; k < sims; k++) {
    const results = [...played];
    for (const u of upcoming) results.push({ ...u, homePts: draw(expected.get(u.home) ?? mean), awayPts: draw(expected.get(u.away) ?? mean) });
    for (const id of through(tabulate(teamIds, results))) made.set(id, made.get(id)! + 1);
  }
  for (const [id, n] of made) out.set(id, Math.round((100 * n) / sims));
  return out;
}
