import { notFound } from "next/navigation";
import { myTeamOrWelcome } from "@/lib/auth";
import { teamSummaries } from "@/lib/league";
import { getOffer } from "@/lib/trades";
import { acceptOffer, closeOffer } from "@/app/(league)/trade/actions";
import SubmitButton from "@/components/SubmitButton";
import BackBar from "@/components/BackBar";
import Slide from "@/components/Slide";
import TradeSheet from "@/components/TradeSheet";

export const dynamic = "force-dynamic";

const DONE: Record<string, [string, string]> = {
  accepted: ["Accepted", "bg-good/15 text-good"],
  declined: ["Declined", "bg-fg/[0.06] text-muted"],
  cancelled: ["Cancelled", "bg-fg/[0.06] text-muted"],
};

// One trade offer (where the email's green button lands): both sides in one card, then Accept / Decline.
export default async function OfferPage({ params }: PageProps<"/offers/[id]">) {
  const [{ id }, me, teams] = await Promise.all([params, myTeamOrWelcome(), teamSummaries()]);
  const o = await getOffer(id, me.id);
  if (!o) notFound();
  const mine = teams.find((t) => t.id === me.id)!;
  const theirs = teams.find((t) => t.id === o.other.id);
  const open = o.status === "pending";
  const [label, tone] = open
    ? o.mine ? [`Waiting for ${o.other.name}`, "bg-orange/15 text-orange"] : ["Your call", "bg-crimson/10 text-crimson"]
    : DONE[o.status] ?? [o.status, "bg-fg/[0.06] text-muted"];

  return (
    <Slide>
      <div className="mx-auto max-w-md space-y-4">
        <BackBar href="/team" title="Trade offer" sub={o.mine ? `To ${o.other.name}` : `From ${o.other.name}`} />
        <div className="flex justify-center">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
          <TradeSheet
            me={{ name: mine.name, space: mine.capSpace }}
            them={{ name: o.other.name, space: theirs?.capSpace ?? 0 }}
            get={o.get}
            give={o.give}
            showCap={open && !!theirs}
          />
        </div>
        {open && (
          <>
            <div className="flex gap-2">
              <form action={closeOffer} className="flex-1">
                <input type="hidden" name="offer" value={o.id} />
                <SubmitButton className={`w-full rounded-full border-[1.5px] bg-card py-3 font-semibold ${o.mine ? "border-bad/40 text-bad" : "border-line"}`}>
                  {o.mine ? "Cancel offer" : "Decline"}
                </SubmitButton>
              </form>
              {!o.mine && (
                <form action={acceptOffer} className="flex-1">
                  <input type="hidden" name="offer" value={o.id} />
                  <SubmitButton className="w-full rounded-full bg-good-fill py-3 font-semibold text-white">Accept</SubmitButton>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </Slide>
  );
}
