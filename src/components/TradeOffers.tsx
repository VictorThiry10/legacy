import Link from "next/link";
import type { openOffers } from "@/lib/trades";
import SubmitButton from "./SubmitButton";
import { money } from "@/lib/rules";
import { acceptOffer, closeOffer } from "@/app/(league)/trade/actions";

// Open trade offers for my team: received ones to accept or decline, sent ones to cancel.
// Takes the offers already being fetched (TeamView starts it early), so it never waits in line.
export default async function TradeOffers({ offers: pending }: { offers: ReturnType<typeof openOffers> }) {
  const offers = await pending;
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
              <form action={acceptOffer}><input type="hidden" name="offer" value={o.id} /><SubmitButton className="rounded-full bg-blue px-5 py-1.5 font-semibold text-white">Accept</SubmitButton></form>
            )}
            <form action={closeOffer}>
              <input type="hidden" name="offer" value={o.id} />
              <SubmitButton className="rounded-full border border-line px-5 py-1.5 font-semibold">{o.mine ? "Cancel" : "Decline"}</SubmitButton>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
