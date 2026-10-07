import { money } from "./rules";

// The transactions log in words. Pure: roster.ts reads the log, this says what each line means.

export type Move = {
  id: string; kind: "sign" | "release" | "trade" | "pick"; created_at: string; group_id: string | null; note: string | null;
  salary: number | null; years: number | null;
  via: string | null; // how the contract came (contracts.acquired_via): rookie, extension, free_agent, waiver, draft (free agency), manual
  team: string; team_id: string; other_team: string | null; other_team_id: string | null;
  player: string; player_id: string | null; // kind "pick": `player` is the pick's name ("2027 pick (Thiros)"), no player_id
};

// One move, without the team, in two parts around the player's name (so a page can link it): "drafted" Cameron
// Boozer "", "got" LeBron James " from Cancunistan". `detail` is the contract: "$4m, 4 yr".
export function describe(m: Move): { verb: string; tail: string; detail: string | null } {
  const deal = m.salary == null ? null : `${money(m.salary)}${m.years ? `, ${m.years} yr` : ""}`;
  switch (m.kind) {
    case "sign": {
      const verb = { rookie: "drafted", extension: "extended", free_agent: "picked up", waiver: "claimed" }[m.via ?? ""] ?? "signed";
      return { verb, tail: "", detail: deal };
    }
    case "release":
      return { verb: /^dropped/i.test(m.note ?? "") ? "dropped" : "released", tail: "", detail: null };
    case "trade":
      return { verb: "got", tail: ` from ${m.other_team ?? "?"}`, detail: m.salary == null ? null : money(m.salary) };
    case "pick":
      return { verb: "got the", tail: ` from ${m.other_team ?? "?"}`, detail: null };
  }
}

// The whole line: "Thiros drafted Cameron Boozer".
export function headline(m: Move) {
  const d = describe(m);
  return `${m.team} ${d.verb} ${m.player}${d.tail}`;
}
