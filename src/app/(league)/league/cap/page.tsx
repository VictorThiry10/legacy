import { getMe } from "@/lib/auth";
import { getSettings, teamSummaries } from "@/lib/league";
import { money } from "@/lib/rules";
import { head, IntelPage, TeamCell } from "../ui";

export const dynamic = "force-dynamic";

// Intel: every team's roster size, salary and cap space.
export default async function CapSheet() {
  const [me, { rules }, teams] = await Promise.all([getMe(), getSettings(), teamSummaries()]);
  const myId = me?.team?.id;
  return (
    <IntelPage title="Cap sheet">
      <div className={`grid grid-cols-[minmax(0,1fr)_3rem_4rem_4rem] items-center gap-2 border-b border-line px-4 py-2 ${head}`}>
        <span>Team</span><span className="text-center">Roster</span><span className="text-right">Salary</span><span className="text-right">Space</span>
      </div>
      {teams.map((t) => (
        <div key={t.id} className={`grid grid-cols-[minmax(0,1fr)_3rem_4rem_4rem] items-center gap-2 border-b border-line/60 px-4 py-3 ${t.id === myId ? "bg-blue/10" : ""}`}>
          <TeamCell t={t} />
          <span className="text-center num">{t.state.rosterCount}/{rules.rosterMax}</span>
          <span className="text-right num">{money(t.state.salary)}</span>
          <span className={`text-right num font-semibold ${t.capSpace < 0 ? "text-bad" : ""}`}>{money(t.capSpace)}</span>
        </div>
      ))}
    </IntelPage>
  );
}
