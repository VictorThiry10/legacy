import type { AppStatus } from "@/lib/bidding";
import { roundName } from "./bidding/ui";
import { When } from "./bidding/time";
import PendingRow from "./PendingRow";

// The Team page's way into free agency (Pending.tsx): where the auction is and until when (in my own time zone),
// with a crimson button when it's on me. The room (/bidding) knows the league login, so there's no second sign in.
export default function FreeAgencyRow({ s }: { s: AppStatus }) {
  const round = roundName(s.round);
  const row =
    s.phase === "waiting" ? {
      title: "Free agency",
      sub: s.round?.opensAt ? <>{round} opens <When iso={s.round.opensAt} /></> : "Not scheduled yet",
      action: s.isCommish && !s.round?.opensAt ? "Set up" : undefined,
    }
    : s.phase === "bidding" ? { title: `${round} is open`, sub: <>Sealed bids until <When iso={s.round?.closesAt ?? null} style="time" /></>, action: "Bid" }
    : s.phase === "reveal" ? { title: `${round} results`, sub: <>Renounce until <When iso={s.round?.settlesAt ?? null} style="time" /></>, action: "See" }
    : s.signings ? { title: "Free agency contracts", sub: `Pick lengths for your ${s.signings} signing${s.signings === 1 ? "" : "s"}`, action: "Pick" }
    : { title: "Free agency is over", sub: "See every signing", action: s.isCommish ? "Lock" : undefined };
  return <PendingRow href="/bidding" icon={<GavelIcon />} {...row} />;
}

const GavelIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8" />
  </svg>
);
