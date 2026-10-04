export type LotteryTeam = { id: string; name: string; color: string; odds: number }; // odds: % chance at the #1 pick

// The eight teams and their colours.
const TEAMS: [name: string, color: string][] = [
  ["Theo", "#ef4444"], ["Elliot", "#f97316"], ["Ilan", "#facc15"], ["Benji", "#22c55e"],
  ["Thiry", "#14b8a6"], ["Awad", "#3b82f6"], ["Chomi", "#a855f7"], ["Brunson", "#ec4899"],
];
const STEP = 2.5; // odds come in steps of 2.5%

// Test field: random odds, in a random order of teams, best odds first (standing in for worst record first).
// 100% is cut into eight random runs of 2.5%, so every team has a chance.
export function randomField(): LotteryTeam[] {
  const parts = 100 / STEP;
  const cuts = new Set<number>();
  while (cuts.size < TEAMS.length - 1) cuts.add(1 + Math.floor(Math.random() * (parts - 1)));
  const edges = [0, ...[...cuts].sort((a, b) => a - b), parts];
  const shares = edges.slice(1).map((e, i) => e - edges[i]).sort((a, b) => b - a);
  const shuffled = TEAMS.map((t) => ({ t, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  return shuffled.map(([name, color], i) => ({ id: name, name, color, odds: shares[i] * STEP }));
}
