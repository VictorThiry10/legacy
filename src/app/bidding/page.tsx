import Link from "next/link";
import { bidTeam, commishVerified, inLeagueApp, room } from "@/lib/bidding";
import { AUCTION_ON_HOLD } from "@/lib/auction-hold";
import { getSettings } from "@/lib/league";
import { load } from "@/lib/guard";
import Login from "@/components/bidding/Login";
import Room from "@/components/bidding/Room";

export const dynamic = "force-dynamic";

export default async function Bidding() {
  // The room needs the settings too: read them while the session is checked (cached for the request).
  const [team, app] = await Promise.all([bidTeam(), inLeagueApp(), getSettings()]);
  if (AUCTION_ON_HOLD && !(team && (await commishVerified(team)))) return <OnHold app={app} />;
  if (!team) return <Login />;
  const data = await load(() => room(team));
  if ("err" in data) return <p className="p-8 text-center text-[var(--bad)]">{data.err}</p>;
  return <Room data={data.ok} me={{ id: team.id, name: team.name }} app={app} />;
}

// What the GMs see while free agency is on hold (lib/auction-hold.ts).
function OnHold({ app }: { app: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-6xl leading-[0.85]">Free agency</h1>
        <p className="mt-3 text-sm text-white/55">Not open yet.</p>
        {app && <Link href="/team" className="btn-primary mt-6 inline-block h-10 rounded-full px-5 text-sm font-semibold leading-10">Back to the league</Link>}
      </div>
    </main>
  );
}
