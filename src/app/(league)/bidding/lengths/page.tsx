import { notFound } from "next/navigation";
import { bidTeam, commishVerified, inLeagueApp, lengthsPreview } from "@/lib/bidding";
import { load } from "@/lib/guard";
import BackBar from "@/components/BackBar";
import Slide from "@/components/Slide";
import Room from "@/components/bidding/Room";

export const dynamic = "force-dynamic";

// The contract lengths screen ahead of its time, for the commissioner to try while the auction is still on. It is
// the real thing on the real signings so far (saving is real too, lengths stay editable until the lock).
export default async function Lengths() {
  const [team, app] = await Promise.all([bidTeam(), inLeagueApp()]);
  if (!team || !(await commishVerified(team))) notFound();
  const data = await load(() => lengthsPreview(team));
  if ("err" in data) return <p className="p-8 text-center text-bad">{data.err}</p>;
  return (
    <Slide>
      <div className="mx-auto max-w-5xl space-y-4">
        <BackBar href="/bidding" title="Contract lengths" sub="Preview" />
        <Room data={data.ok} me={{ id: team.id, name: team.name }} app={app} />
      </div>
    </Slide>
  );
}
