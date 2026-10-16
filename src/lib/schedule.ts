// Head to head schedule: round robin pairings laid over scoring weeks. Pure functions, easy to test.
import { addDays, weekdayIndex } from "./dates";

// Every team plays every other once per cycle (circle method). Odd counts get a bye (null).
export function roundRobin<T>(teams: T[]): [T, T][][] {
  const list: (T | null)[] = teams.length % 2 ? [...teams, null] : [...teams];
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 ? [b, a] : [a, b]); // alternate home and away
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!); // rotate all but the first
  }
  return rounds;
}

// Scoring weeks: week 1 runs from the first day to that Sunday, then Monday to Sunday.
export function scoringWeeks(firstDay: string, count: number): { week: number; starts: string; ends: string }[] {
  const out = [];
  let starts = firstDay;
  for (let week = 1; week <= count; week++) {
    const ends = addDays(starts, (7 - weekdayIndex(starts)) % 7);
    out.push({ week, starts, ends });
    starts = addDays(ends, 1);
  }
  return out;
}

// Conferences: every team plays its conference rivals three times (the round robin three times over, homes
// alternating) and the other conference's teams once, then one more week across so that 4 + 4 teams fill 14 weeks
// (the first across round again, homes swapped). Two conference weeks, then one across, and so on.
export function conferenceRounds(a: string[], b: string[]): [string, string][][] {
  const flip = (r: [string, string][]) => r.map(([h, w]) => [w, h] as [string, string]);
  const within: [string, string][][] = [];
  const [ra, rb] = [roundRobin(a), roundRobin(b)];
  for (let c = 0; c < 3; c++) for (let r = 0; r < ra.length; r++) within.push(c % 2 ? [...flip(ra[r]), ...flip(rb[r])] : [...ra[r], ...rb[r]]);
  const n = a.length;
  const across: [string, string][][] = Array.from({ length: n }, (_, i) => a.map((x, j) => (i % 2 ? [b[(j + i) % n], x] : [x, b[(j + i) % n]]) as [string, string]));
  across.push(flip(across[0]));
  const weeks: [string, string][][] = [];
  for (let i = 0, x = 0; i < within.length || x < across.length; ) {
    for (let k = 0; k < 2 && i < within.length; k++) weeks.push(within[i++]);
    if (x < across.length) weeks.push(across[x++]);
  }
  return weeks;
}

// Two conferences of the same size, from each team's conference; null when the teams don't split that way.
export function conferenceGroups(teamIds: string[], conferenceOf: (id: string) => string | null | undefined): [string[], string[]] | null {
  const groups = new Map<string, string[]>();
  for (const id of teamIds) {
    const c = conferenceOf(id);
    if (!c) return null;
    groups.set(c, [...(groups.get(c) ?? []), id]);
  }
  const [a, b] = [...groups.keys()].sort().map((k) => groups.get(k)!);
  return a && b && groups.size === 2 && a.length === b.length && a.length >= 2 ? [a, b] : null;
}

export type ScheduleRow = { week: number; starts: string; ends: string; round: "regular" | "semi" | "final"; home_team_id: string | null; away_team_id: string | null };

/**
 * The season: by conference when the teams have them (conferenceRounds), otherwise two legs (every pairing twice,
 * home and away swapped); then semifinals and a final, each played over two weeks (total points). Playoff teams
 * are left empty until the standings decide them.
 */
export function buildSchedule(teamIds: string[], firstDay: string, conferenceOf?: (id: string) => string | null | undefined): ScheduleRow[] {
  const groups = conferenceOf ? conferenceGroups(teamIds, conferenceOf) : null;
  const legOne = roundRobin(teamIds);
  const rounds = groups ? conferenceRounds(...groups) : [...legOne, ...legOne.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
  const weeks = scoringWeeks(firstDay, rounds.length + 4);
  const regular: ScheduleRow[] = rounds.flatMap((pairs, i) =>
    pairs.map(([home, away]) => ({ ...weeks[i], round: "regular" as const, home_team_id: home, away_team_id: away })),
  );
  const twoWeeks = (i: number) => ({ week: weeks[i].week, starts: weeks[i].starts, ends: weeks[i + 1].ends });
  const n = rounds.length;
  const empty = { home_team_id: null, away_team_id: null };
  return [
    ...regular,
    { ...twoWeeks(n), round: "semi", ...empty },
    { ...twoWeeks(n), round: "semi", ...empty },
    { ...twoWeeks(n + 2), round: "final", ...empty },
  ];
}

/**
 * The preseason dress rehearsal: the whole season squeezed into the NBA preseason (first to last day):
 * two short regular weeks (round robin rounds 1 and 2), semifinals, then a final, in about 3 / 4 / 3 / 4 days.
 */
export function rehearsalSchedule(teamIds: string[], first: string, last: string): ScheduleRow[] {
  let span = 1;
  while (addDays(first, span) <= last) span++;
  const sizes = [3, 4, 3].map((n) => Math.max(1, Math.round((n * span) / 14)));
  const starts: string[] = [first];
  for (const n of sizes) starts.push(addDays(starts[starts.length - 1], n));
  const phase = (i: number) => ({ week: i + 1, starts: starts[i], ends: i < 3 ? addDays(starts[i + 1], -1) : last });
  const [r1, r2] = roundRobin(teamIds);
  const empty = { home_team_id: null, away_team_id: null };
  return [
    ...r1.map(([home, away]) => ({ ...phase(0), round: "regular" as const, home_team_id: home, away_team_id: away })),
    ...(r2 ?? []).map(([home, away]) => ({ ...phase(1), round: "regular" as const, home_team_id: home, away_team_id: away })),
    { ...phase(2), round: "semi", ...empty },
    { ...phase(2), round: "semi", ...empty },
    { ...phase(3), round: "final", ...empty },
  ];
}

// Semifinals from the final standings (best first): 1 v 4 and 2 v 3, higher seed at home.
export const semifinalPairs = (seeds: string[]): [string, string][] => [[seeds[0], seeds[3]], [seeds[1], seeds[2]]];

// Who goes through: more points over the two weeks; a tie goes to the higher seed (home).
export const winner = (m: { home_team_id: string; away_team_id: string }, home: number, away: number) =>
  away > home ? m.away_team_id : m.home_team_id;
