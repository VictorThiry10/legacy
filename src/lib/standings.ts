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
