import type { DrumTeam } from "./Machine";

export type LotteryTeam = DrumTeam & { odds: number }; // odds: % chance at the #1 pick

// The eight teams and their ball colours.
const TEAMS: [name: string, color: string][] = [
  ["Theo", "#ef4444"], ["Elliot", "#f97316"], ["Ilan", "#facc15"], ["Benji", "#22c55e"],
  ["Thiry", "#14b8a6"], ["Awad", "#3b82f6"], ["Chomi", "#a855f7"], ["Brunson", "#ec4899"],
];
const BALLS = 40; // 2.5% each, numbered 1 to 40

// Test field: random odds. The 40 balls are cut into eight random runs (every team gets at least one ball),
// handed to the teams in a random order, best odds first.
export function randomField(): LotteryTeam[] {
  const cuts = new Set<number>();
  while (cuts.size < TEAMS.length - 1) cuts.add(1 + Math.floor(Math.random() * (BALLS - 1)));
  const edges = [0, ...[...cuts].sort((a, b) => a - b), BALLS];
  const counts = edges.slice(1).map((e, i) => e - edges[i]).sort((a, b) => b - a);
  const shuffled = TEAMS.map((t) => ({ t, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  return shuffled.map(([name, color], i) => {
    const first = counts.slice(0, i).reduce((a, b) => a + b, 1);
    return { id: name, name, color, odds: (counts[i] / BALLS) * 100, balls: Array.from({ length: counts[i] }, (_, k) => first + k) };
  });
}

// The draft order for a field: a random ball out of those left picks next, then that team's balls come out.
export function drawOrder(teams: LotteryTeam[]): string[] {
  const left = teams.map((t) => ({ id: t.id, n: t.balls.length }));
  const order: string[] = [];
  while (left.length) {
    let r = Math.random() * left.reduce((a, t) => a + t.n, 0);
    const i = left.findIndex((t) => (r -= t.n) < 0);
    order.push(left.splice(i < 0 ? left.length - 1 : i, 1)[0].id);
  }
  return order;
}
