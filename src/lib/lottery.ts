// The rookie lottery's field. Pure: used on the server (the draw) and in the browser (names and colours).
import { drawLottery, lotteryOdds } from "./rules";

// The eight GMs as the lottery shows them, with last season's (2025-26) regular season record, worst first.
// Records only: the playoffs' final ranking doesn't count here.
export const GMS = [
  { id: "34ee3e73-cbae-4375-8d22-5e68c3e28082", name: "Elliot", color: "#f97316", won: 2, lost: 12 },
  { id: "3801e216-2d94-4a2f-8127-d93f23349271", name: "Ilan", color: "#facc15", won: 4, lost: 10 },
  { id: "6d5b886f-4f6e-4ac1-a76d-3ac1e9f02f55", name: "Theo", color: "#ef4444", won: 6, lost: 8 },
  { id: "9e6068c5-bed0-4056-b4c7-33a6bc30f26f", name: "Awad", color: "#3b82f6", won: 7, lost: 7 },
  { id: "eadbbfbf-84dd-4e9a-a4bf-5ac10295035d", name: "Benji", color: "#22c55e", won: 7, lost: 7 },
  { id: "95b613dc-64b6-4d2f-8774-ba38fa257b60", name: "Thiry", color: "#14b8a6", won: 7, lost: 7 },
  { id: "27b5d5b3-b282-44d9-9eea-d59f1dc5d9e3", name: "Chomi", color: "#a855f7", won: 11, lost: 3 },
  { id: "0fd155b1-6b98-4888-95ca-4c51f4a7d383", name: "Brunson", color: "#ec4899", won: 12, lost: 2 },
];

// How a team shows in the lottery and the draft (a team that isn't one of the eight: a grey "?").
export const gm = (teamId: string | null | undefined) => GMS.find((g) => g.id === teamId) ?? { id: teamId ?? "", name: "?", color: "#9ca3af", won: 0, lost: 0 };

export type LotteryTeam = { id: string; name: string; color: string; record: string; odds: number }; // odds: % chance at the #1 pick

// The field, worst record first, with each team's odds at #1. Teams with the same record share their places' odds
// equally, like the NBA: three teams at 7-7 over places 4 to 6 get (10 + 7.5 + 7.5) / 3 each.
export function lotteryField(): LotteryTeam[] {
  const sorted = [...GMS].sort((a, b) => a.won / (a.won + a.lost) - b.won / (b.won + b.lost));
  const byPlace = lotteryOdds(sorted.map((g) => g.id));
  return sorted.map((g) => {
    const tied = sorted.filter((o) => o.won === g.won && o.lost === g.lost);
    return { id: g.id, name: g.name, color: g.color, record: `${g.won}-${g.lost}`, odds: tied.reduce((a, o) => a + byPlace[o.id], 0) / tied.length };
  });
}

// Draw the lottery for the field (rules.ts): the draft order, #1 first. Teams tied on record have no order between
// them, so that is drawn first: it decides who picks earlier among them when the balls don't.
export function drawField(rand: () => number = Math.random): string[] {
  const field = lotteryField();
  // place: where a team's record first appears, so tied teams have the same one and only they are reordered
  const seeded = field.map((t) => ({ ...t, place: field.findIndex((o) => o.record === t.record), coin: rand() }));
  const worstToBest = seeded.sort((a, b) => a.place - b.place || a.coin - b.coin);
  return drawLottery(worstToBest.map((t) => t.id), rand, Object.fromEntries(field.map((t) => [t.id, t.odds]))).order;
}
