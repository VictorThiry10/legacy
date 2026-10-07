import { recentMoves } from "@/lib/roster";
import { load } from "@/lib/guard";
import Moves from "@/components/Moves";
import MarkSeen from "@/components/MarkSeen";
import { IntelPage } from "../ui";

export const dynamic = "force-dynamic";

// Intel: the transactions log. Opening it clears the red dot on the Team page's row.
export default async function RecentMoves() {
  const r = await load(() => recentMoves(100));
  return (
    <IntelPage title="Recent moves">
      <MarkSeen />
      {"err" in r ? <p className="px-4 py-4 text-sm text-bad">{r.err}</p> : <Moves moves={r.ok} />}
    </IntelPage>
  );
}
