import type { Offer } from "@/lib/trades";
import type { ExtensionOffer } from "@/lib/extensions";
import type { AppStatus } from "@/lib/bidding";
import PendingRow, { TradeIcon } from "./PendingRow";
import { ExtensionsRow } from "./Extensions";
import FreeAgencyRow from "./FreeAgencyRow";
import DraftRow from "./lottery/DraftRow";
import type { DraftRowInfo } from "@/lib/draft";
import type { MovesRowInfo } from "@/lib/roster";
import { headline } from "@/lib/moves";
import { HistoryIcon } from "./PendingRow";
import AssignLengthsRow from "./AssignLengths";
import type { LengthChoice } from "@/lib/pick-lengths";

// Everything waiting on my team, in one card at the top of the Team page: contract lengths to assign (players the
// commissioner gave my team), free agency while it runs, what I have to decide, then the offers I sent. Each row opens the full thing (the auction room, the extensions pop-up, the
// offer page with Accept / Decline). Last, the league's recent moves: the latest one, a red dot when there's one I
// haven't seen. Takes promises already started (TeamView starts them early), so it never waits in line.
export default async function Pending({ offers, extensions, freeAgency, rookieDraft, moves, lengths }: {
  offers: Promise<Offer[]>; extensions: Promise<ExtensionOffer | null>; freeAgency: Promise<AppStatus | null>; rookieDraft: Promise<DraftRowInfo | null>;
  moves: Promise<MovesRowInfo | null>; lengths: Promise<LengthChoice | null>;
}) {
  const [all, ext, fa, draft, mv, len] = await Promise.all([offers, extensions, freeAgency, rookieDraft, moves, lengths]);
  if (!fa && !ext && !draft && !all.length && !mv && !len) return null;
  const picks = (ps: { year: number }[]) => ps.map((p) => ({ name: `${p.year} pick` }));
  const deal = (o: Offer) => `${few([...o.get, ...picks(o.getPicks)])} for ${few([...o.give, ...picks(o.givePicks)])}`;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {len && <AssignLengthsRow choice={len} />}
      {draft && <DraftRow info={draft} />}
      {fa && <FreeAgencyRow s={fa} />}
      {ext && <ExtensionsRow offer={ext} />}
      {all.filter((o) => !o.mine).map((o) => (
        <PendingRow key={o.id} href={`/offers/${o.id}`} icon={<TradeIcon />} title={`${o.other.name} wants to trade`} sub={deal(o)} action="Review" />
      ))}
      {all.filter((o) => o.mine).map((o) => (
        <PendingRow key={o.id} href={`/offers/${o.id}`} icon={<TradeIcon />} title={`Offer sent to ${o.other.name}`} sub={deal(o)} />
      ))}
      {mv && <PendingRow href="/league/moves" icon={<HistoryIcon />} title="Recent moves" sub={headline(mv.latest)} dot={mv.unseen} />}
    </div>
  );
}

// "Trae Young +4": the first (biggest) name and how many more.
const few = (ps: { name: string }[]) => (!ps.length ? "nothing" : ps.length === 1 ? ps[0].name : `${ps[0].name} +${ps.length - 1}`);
