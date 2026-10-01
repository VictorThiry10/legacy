import Link from "next/link";
import { openOffers } from "@/lib/trades";
import { money } from "@/lib/rules";
import { acceptOffer, closeOffer } from "@/app/trade/actions";

// Open trade offers for my team: received ones to accept or decline, sent ones to cancel.
export default async function TradeOffers({ teamId }: { teamId: string }) {
  const offers = await openOffers(teamId);
  if (!offers.length) return null;
  const names = (ps: { name: string; salary: number }[]) => (ps.length ? ps.map((p) => `${p.name} (${money(p.salary)})`).join(", ") : "nobody");
  return (
    <div className="space-y-2">
      {offers.map((o) => (
        <div key={o.id} className="card space-y-2 border-blue/40 text-sm">
          <div className="font-semibold">
            {o.mine ? <>Offer sent to <Link href={`/teams/${o.other.id}`} className="hover:underline">{o.other.name}</Link></> : <><Link href={`/teams/${o.other.id}`} className="hover:underline">{o.other.name}</Link> wants to trade</>}
          </div>
          <div><span className="text-muted">You get </span>{names(o.get)}</div>
          <div><span className="text-muted">You give </span>{names(o.give)}</div>
          <div className="flex gap-2 pt-1">
            {!o.mine && (
              <form action={acceptOffer}><input type="hidden" name="offer" value={o.id} /><button className="rounded-full bg-blue px-5 py-1.5 font-semibold text-white">Accept</button></form>
            )}
            <form action={closeOffer}>
              <input type="hidden" name="offer" value={o.id} />
              <button className="rounded-full border border-line px-5 py-1.5 font-semibold">{o.mine ? "Cancel" : "Decline"}</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
