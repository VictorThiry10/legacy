// The rookie lottery's field. Pure: used on the server (the draw) and in the browser (names and colours).
import { drawLottery, lotteryOdds } from "./rules";

// The eight GMs as the lottery shows them, worst first, by last season's (2025-26) regular season record.
// Records only: the playoffs don't move anyone. The three teams level at 7-7 are split by the final ranking,
// as the commissioner set it: Benji 5th, Awad 4th, Thiry 3rd.
export const GMS = [
  { id: "84af81f4-68b1-4803-85ed-8817f89657ea", name: "Jeremy", color: "#f97316", record: "2-12" }, // took over Elliot's spot (its record, its #7 pick) on 2026-10-09
  { id: "3801e216-2d94-4a2f-8127-d93f23349271", name: "Ilan", color: "#facc15", record: "4-10" },
  { id: "6d5b886f-4f6e-4ac1-a76d-3ac1e9f02f55", name: "Theo", color: "#ef4444", record: "6-8" },
  { id: "eadbbfbf-84dd-4e9a-a4bf-5ac10295035d", name: "Benji", color: "#22c55e", record: "7-7" },
  { id: "9e6068c5-bed0-4056-b4c7-33a6bc30f26f", name: "Awad", color: "#3b82f6", record: "7-7" },
  { id: "95b613dc-64b6-4d2f-8774-ba38fa257b60", name: "Thiry", color: "#14b8a6", record: "7-7" },
  { id: "27b5d5b3-b282-44d9-9eea-d59f1dc5d9e3", name: "Chomi", color: "#a855f7", record: "11-3" },
  { id: "0fd155b1-6b98-4888-95ca-4c51f4a7d383", name: "Brunson", color: "#ec4899", record: "12-2" },
];

// How a team shows in the lottery and the draft (a team that isn't one of the eight: a grey "?").
export const gm = (teamId: string | null | undefined) => GMS.find((g) => g.id === teamId) ?? { id: teamId ?? "", name: "?", color: "#9ca3af", record: "" };

export type LotteryTeam = { id: string; name: string; color: string; record: string; odds: number }; // odds: % chance at the #1 pick

// The field, worst first, with each team's odds at #1 (rules.ts: 25, 20, 15, 10, then 7.5 each).
export function lotteryField(): LotteryTeam[] {
  const odds = lotteryOdds(GMS.map((g) => g.id));
  return GMS.map((g) => ({ ...g, odds: odds[g.id] }));
}

// Draw the lottery for the field (rules.ts): the draft order, team ids, #1 first. Every pick is drawn.
export const drawField = (rand: () => number = Math.random) => drawLottery(GMS.map((g) => g.id), rand).order;
