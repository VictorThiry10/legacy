import { bidTeam, room } from "@/lib/bidding";
import { getSettings } from "@/lib/league";
import { load } from "@/lib/guard";
import Login from "@/components/bidding/Login";
import Room from "@/components/bidding/Room";

export const dynamic = "force-dynamic";

export default async function Bidding() {
  // The room needs the settings too: read them while the session is checked (cached for the request).
  const [team] = await Promise.all([bidTeam(), getSettings()]);
  if (!team) return <Login />;
  const data = await load(() => room(team));
  if ("err" in data) return <p className="p-8 text-center text-[var(--bad)]">{data.err}</p>;
  return <Room data={data.ok} me={{ id: team.id, name: team.name }} />;
}
