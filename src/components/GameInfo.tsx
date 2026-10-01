import type { Game } from "@/lib/nba";
import LocalTime from "./LocalTime";

// "BOS" at home, "@BOS" away.
export function oppLabel(g: Game, teamId: string, abbr: Map<string, string>) {
  return g.home_team_id === teamId ? abbr.get(g.away_team_id) ?? "?" : `@${abbr.get(g.home_team_id) ?? "?"}`;
}

// Tip-off time (viewer's time zone), live score, or final result.
export function GameStatus({ g, teamId }: { g: Game; teamId: string }) {
  if (g.state === "pre") return <LocalTime iso={g.start} />;
  const home = g.home_team_id === teamId;
  const us = (home ? g.home_score : g.away_score) ?? 0;
  const them = (home ? g.away_score : g.home_score) ?? 0;
  if (g.state === "in") return <span className="text-accent">Live {us}-{them}</span>;
  return <span className={us > them ? "text-good" : "text-bad"}>{us > them ? "W" : "L"} {us}-{them}</span>;
}
