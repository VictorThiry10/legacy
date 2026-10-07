import type { RoundInfo } from "@/lib/bidding";
import type { Look } from "@/lib/team-look";
import TeamAvatar from "../TeamAvatar";

// Small shared bits of the auction.

export const ease = [0.22, 1, 0.36, 1] as const;
export const GOLD = "#e9c46a";

// Every button in the auction is a pill (the app's .btn classes are rounded boxes, and they win over utilities).
export const BTN = "inline-flex items-center justify-center rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-40";
export const GHOST = "inline-flex items-center justify-center rounded-full border border-line bg-card px-4 py-2 text-sm font-medium disabled:opacity-40";
export const PRIMARY = "inline-flex items-center justify-center rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40";

export const roundName = (r: RoundInfo | null | undefined) => (!r ? "" : r.kind === "leftovers" ? "Last chance round" : `Round ${r.number}`);

export const reasonText = (r?: string) =>
  r === "over_cap" ? "over the cap" : r === "roster_full" ? "roster full" : r?.startsWith("no_") ? "no contract slot left" : "not allowed";

// A GM's badge, the same as in the league app (Matchup, League): the team's photo, or its initials on its colour.
export function Gm({ team, size = "md" }: { team?: Look | null; size?: "sm" | "md" | "lg" }) {
  return <TeamAvatar team={team} size={size} />;
}

// A small rounded label, like the app's offer states.
export function Pill({ tone = "muted", children, className = "" }: { tone?: "muted" | "crimson" | "orange" | "good" | "dark"; children: React.ReactNode; className?: string }) {
  const tones = {
    muted: "bg-fg/[0.06] text-muted",
    crimson: "bg-crimson/10 text-crimson",
    orange: "bg-orange/15 text-orange",
    good: "bg-good/10 text-good",
    dark: "bg-white/10 text-white/80", // on the reveal's dark screen
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

// What happened to a bid that didn't win.
export function BidStatus({ status, dark = false }: { status: "lost" | "voided" | "renounced"; dark?: boolean }) {
  const label = status === "lost" ? "Rejected" : status === "voided" ? "Voided" : "Renounced";
  const tone = status === "lost" ? (dark ? "dark" : "muted") : status === "voided" ? "orange" : "crimson";
  return <Pill tone={tone}>{label}</Pill>;
}
