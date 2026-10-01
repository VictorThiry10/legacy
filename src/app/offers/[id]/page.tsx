import Link from "next/link";
import { notFound } from "next/navigation";
import { myTeamOrWelcome } from "@/lib/auth";
import { teamSummaries } from "@/lib/league";
import { getOffer } from "@/lib/trades";
import { money } from "@/lib/rules";
import type { RosterPlayer } from "@/lib/roster";
import { acceptOffer, closeOffer } from "@/app/trade/actions";

export const dynamic = "force-dynamic";

// One trade offer (where the email's green button lands): the summary and Accept / Decline.
export default async function OfferPage({ params }: PageProps<"/offers/[id]">) {
  const [{ id }, me, teams] = await Promise.all([params, myTeamOrWelcome(), teamSummaries()]);
  const o = await getOffer(id, me.id);
  if (!o) notFound();
  const sum = (ps: RosterPlayer[]) => ps.reduce((a, p) => a + p.salary, 0);
  const net = sum(o.get) - sum(o.give);
  const mine = teams.find((t) => t.id === me.id)!;
  const theirs = teams.find((t) => t.id === o.other.id);
  const open = o.status === "pending";
  const rows = (ps: RosterPlayer[]) =>
    ps.length ? ps.map((p) => <tr key={p.contract_id}><td className="py-0.5">{p.name}</td><td className="py-0.5 text-right num">{money(p.salary)}</td></tr>)
      : <tr><td className="py-0.5 text-muted">Nobody</td><td /></tr>;
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-4">
      <div className="space-y-3 rounded-2xl bg-card p-5 shadow-sm">
        <h1 className="text-lg font-bold">{o.mine ? `Your offer to ${o.other.name}` : `${o.other.name} wants to trade`}</h1>
        <table className="w-full text-sm">
          <tbody>
            <tr><td colSpan={2} className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">You get</td></tr>
            {rows(o.get)}
            <tr><td colSpan={2} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">You give</td></tr>
            {rows(o.give)}
            {open && (
              <>
                <tr><td className="pt-3 text-muted">Your salary change</td><td className="pt-3 text-right num font-semibold">{net >= 0 ? "+" : "−"}{money(Math.abs(net))}</td></tr>
                <tr><td className="text-muted">Your cap space after</td><td className="text-right num">{money(mine.capSpace - net)}</td></tr>
                {theirs && <tr><td className="text-muted">{theirs.name} cap space after</td><td className="text-right num">{money(theirs.capSpace + net)}</td></tr>}
              </>
            )}
          </tbody>
        </table>
        {open ? (
          <div className="flex gap-2 pt-1">
            <form action={closeOffer} className="flex-1"><input type="hidden" name="offer" value={o.id} /><button className="w-full rounded-full border border-line py-3 font-semibold">{o.mine ? "Cancel offer" : "Decline"}</button></form>
            {!o.mine && <form action={acceptOffer} className="flex-1"><input type="hidden" name="offer" value={o.id} /><button className="w-full rounded-full bg-good py-3 font-semibold text-white">Accept</button></form>}
          </div>
        ) : (
          <p className="text-sm font-semibold capitalize">{o.status}</p>
        )}
      </div>
      <Link href="/team" className="block text-center text-sm text-muted">Your team</Link>
    </div>
  );
}
