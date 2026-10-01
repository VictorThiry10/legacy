import type { RoundInfo } from "@/lib/bidding";
import { initials } from "@/lib/names";

// Small shared bits of the bidding site.

export const ease = [0.22, 1, 0.36, 1] as const;

export const roundName = (r: RoundInfo | null | undefined) => (!r ? "" : r.kind === "leftovers" ? "Last chance round" : `Round ${r.number}`);

export const reasonText = (r?: string) =>
  r === "over_cap" ? "over the cap" : r === "roster_full" ? "roster full" : r?.startsWith("no_") ? "no contract slot left" : "not allowed";

export function Kicker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50 ${className}`}>{children}</div>;
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 ${className}`}>{children}</div>;
}

// A GM's badge: initials, no colour.
export function Gm({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "h-7 w-7 text-[9px]", md: "h-9 w-9 text-[10px]", lg: "h-11 w-11 text-xs" }[size];
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.07] font-semibold tracking-wider text-white/75 ring-1 ring-inset ring-white/10`}>
      {name ? initials(name) : "?"}
    </span>
  );
}
