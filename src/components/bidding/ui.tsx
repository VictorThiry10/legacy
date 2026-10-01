import type { RoundInfo } from "@/lib/bidding";

// Small shared bits of the bidding site.

export const ease = [0.22, 1, 0.36, 1] as const;

export const roundName = (r: RoundInfo | null | undefined) => (!r ? "" : r.kind === "leftovers" ? "Last chance round" : `Round ${r.number}`);

export const reasonText = (r?: string) =>
  r === "over_cap" ? "over the cap" : r === "roster_full" ? "roster full" : r?.startsWith("no_") ? "no contract slot left" : "not allowed";

export function Kicker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50 ${className}`}>{children}</div>;
}
