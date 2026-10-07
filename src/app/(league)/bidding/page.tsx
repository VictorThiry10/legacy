import Link from "next/link";
import { bidTeam, commishVerified, inLeagueApp, room, type Room as Data } from "@/lib/bidding";
import { AUCTION_ON_HOLD } from "@/lib/auction-hold";
import { getSettings } from "@/lib/league";
import { load } from "@/lib/guard";
import { money } from "@/lib/rules";
import BackBar from "@/components/BackBar";
import Slide from "@/components/Slide";
import Login from "@/components/bidding/Login";
import Room from "@/components/bidding/Room";
import { When } from "@/components/bidding/time";
import { roundName } from "@/components/bidding/ui";

export const dynamic = "force-dynamic";

// The auction: a page under the tabs, like a trade offer. The back bar says where the auction is; the room below
// changes with the round (waiting, bidding, results, contract lengths).
export default async function Bidding() {
  // The room needs the settings too: read them while the session is checked (cached for the request).
  const [team, app] = await Promise.all([bidTeam(), inLeagueApp(), getSettings()]);
  if (AUCTION_ON_HOLD && !(team && (await commishVerified(team)))) return <OnHold />;
  if (!team) return <Login />;
  const data = await load(() => room(team));
  if ("err" in data) return <p className="p-8 text-center text-bad">{data.err}</p>;
  const r = data.ok;
  const me = r.teams.find((t) => t.id === r.meId);
  return (
    <Slide>
      <div className="mx-auto max-w-5xl space-y-4">
        <BackBar
          href="/team"
          title="Auction"
          sub={<Where data={r} />}
          right={
            <div className="flex items-center gap-2">
              {me && <span className="text-sm font-semibold tabular-nums">{money(me.capSpace)}</span>}
              {r.isCommish && (
                <Link href="/bidding/setup" aria-label="Rounds" className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:text-fg">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                </Link>
              )}
            </div>
          }
        />
        <Room data={r} me={{ id: team.id, name: team.name }} app={app} />
      </div>
    </Slide>
  );
}

// The back bar's second line: where the auction is right now.
function Where({ data }: { data: Data }) {
  const r = data.round;
  switch (data.phase) {
    case "waiting": return r ? <>{roundName(r)} opens {r.opensAt ? <When iso={r.opensAt} /> : "soon"}</> : <>Not scheduled yet</>;
    case "bidding": return <>{roundName(r)} · closes <When iso={r?.closesAt ?? null} style="time" /></>;
    case "reveal": return <>{roundName(r)} results</>;
    case "contracts": return <>Contract lengths</>;
    default: return <>Done</>;
  }
}

// What the GMs see while free agency is on hold (lib/auction-hold.ts).
function OnHold() {
  return (
    <Slide>
      <div className="mx-auto max-w-5xl">
        <BackBar href="/team" title="Auction" sub="Not open yet" />
      </div>
    </Slide>
  );
}
