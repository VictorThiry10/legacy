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

export type ScheduleRow = { week: number; starts: string; ends: string; round: "regular" | "semi" | "final"; home_team_id: string | null; away_team_id: string | null };

/**
 * The season: two legs (every pairing twice, home and away swapped), then semifinals and a final,
 * each played over two weeks (total points). Playoff teams are left empty until the standings decide them.
 */
export function buildSchedule(teamIds: string[], firstDay: string): ScheduleRow[] {
  const legOne = roundRobin(teamIds);
  const rounds = [...legOne, ...legOne.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
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

// Semifinals from the final standings (best first): 1 v 4 and 2 v 3, higher seed at home.
export const semifinalPairs = (seeds: string[]): [string, string][] => [[seeds[0], seeds[3]], [seeds[1], seeds[2]]];

// Who goes through: more points over the two weeks; a tie goes to the higher seed (home).
export const winner = (m: { home_team_id: string; away_team_id: string }, home: number, away: number) =>
  away > home ? m.away_team_id : m.home_team_id;
