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

export function buildSchedule(teamIds: string[], firstDay: string, weeks: number) {
  const rounds = roundRobin(teamIds);
  return scoringWeeks(firstDay, weeks).flatMap((w, i) =>
    rounds.length ? rounds[i % rounds.length].map(([home, away]) => ({ ...w, home_team_id: home, away_team_id: away })) : [],
  );
}
