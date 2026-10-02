import type { Offer } from "@/lib/trades";
import type { ExtensionOffer } from "@/lib/extensions";
import type { AppStatus } from "@/lib/bidding";
import PendingRow, { TradeIcon } from "./PendingRow";
import { ExtensionsRow } from "./Extensions";
import FreeAgencyRow from "./FreeAgencyRow";

// Everything waiting on my team, in one card at the top of the Team page: free agency while it runs, what I have
// to decide, then the offers I sent. Each row opens the full thing (the auction room, the extensions pop-up, the
// offer page with Accept / Decline). Takes promises already started (TeamView starts them early), so it never waits in line.
export default async function Pending({ offers, extensions, freeAgency }: {
  offers: Promise<Offer[]>; extensions: Promise<ExtensionOffer | null>; freeAgency: Promise<AppStatus | null>;
}) {
  const [all, ext, fa] = await Promise.all([offers, extensions, freeAgency]);
  if (!fa && !ext && !all.length) return null;
  const deal = (o: Offer) => `${few(o.get)} for ${few(o.give)}`;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {fa && <FreeAgencyRow s={fa} />}
      {ext && <ExtensionsRow offer={ext} />}
      {all.filter((o) => !o.mine).map((o) => (
        <PendingRow key={o.id} href={`/offers/${o.id}`} icon={<TradeIcon />} title={`${o.other.name} wants to trade`} sub={deal(o)} action="Review" />
      ))}
      {all.filter((o) => o.mine).map((o) => (
        <PendingRow key={o.id} href={`/offers/${o.id}`} icon={<TradeIcon />} title={`Offer sent to ${o.other.name}`} sub={deal(o)} />
      ))}
    </div>
  );
}

// "Trae Young +4": the first (biggest) name and how many more.
const few = (ps: { name: string }[]) => (!ps.length ? "nobody" : ps.length === 1 ? ps[0].name : `${ps[0].name} +${ps.length - 1}`);
