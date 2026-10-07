import Link from "next/link";
import { getMe } from "@/lib/auth";
import { teamSummaries } from "@/lib/league";
import { draftRecord } from "@/lib/draft";
import { money } from "@/lib/rules";
import TeamAvatar from "@/components/TeamAvatar";
import { FORWARD } from "@/components/Slide";
import LotteryButton from "@/components/lottery/LotteryButton";
import { IntelPage } from "../ui";

export const dynamic = "force-dynamic";

// Intel: this year's rookie draft, the lottery's order and who took whom, with the lottery to watch again. A GM
// who hasn't watched it yet only gets the button: no spoiler.
export default async function RookieDraft() {
  const [me, teams] = await Promise.all([getMe(), teamSummaries()]);
  const myId = me?.team?.id;
  const draft = me?.team ? await draftRecord(me.team).catch(() => null) : null;
  return (
    <IntelPage
      title="Rookie draft"
      right={draft?.watched ? <LotteryButton field={draft.field} className="shrink-0 text-sm font-semibold text-accent">Replay the lottery</LotteryButton> : undefined}
    >
      {!draft && <p className="px-4 py-6 text-center text-sm text-muted">Nothing yet.</p>}
      {draft && !draft.watched && (
        <div className="px-4 py-3">
          <LotteryButton field={draft.field} className="btn w-full">Watch the lottery</LotteryButton>
        </div>
      )}
      {draft?.picks.map((p) => {
        const t = teams.find((x) => x.id === p.team);
        const from = p.original !== p.team ? teams.find((x) => x.id === p.original) : undefined;
        return (
          <div key={p.slot} className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line/60 px-4 py-2.5 ${p.team === myId ? "bg-blue/10" : ""}`}>
            <span className="num text-sm font-bold text-muted">{p.slot}</span>
            <span className="flex min-w-0 items-center gap-2.5">
              <TeamAvatar name={t?.name} size="sm" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold">{t?.name ?? "?"}</span>
                {from && <span className="block truncate text-xs text-muted">from {from.name}</span>}
              </span>
            </span>
            {p.rookie ? (
              <span className="text-right leading-tight">
                <Link href={`/players/${p.rookie.id}`} prefetch={false} transitionTypes={FORWARD} className="block text-sm font-medium text-blue">{p.rookie.name}</Link>
                <span className="num block text-xs text-muted">{money(p.rookie.salary)} · {p.rookie.years} yr</span>
              </span>
            ) : (
              <span className={`text-xs ${p.slot === draft.onClock ? "font-semibold text-accent" : "text-muted"}`}>{p.slot === draft.onClock ? "On the clock" : "—"}</span>
            )}
          </div>
        );
      })}
    </IntelPage>
  );
}
