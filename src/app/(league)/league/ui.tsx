import Link from "next/link";
import type { TeamSummary } from "@/lib/league";
import TeamAvatar from "@/components/TeamAvatar";
import BackBar from "@/components/BackBar";
import Slide from "@/components/Slide";
import { FORWARD } from "@/components/Slide";

// Bits shared by the League page and its Intel pages (cap sheet, moves, rookie draft, draft picks).

export const head = "text-[11px] font-bold uppercase tracking-wide";

export function TeamCell({ t }: { t?: TeamSummary }) {
  if (!t) return <span className="text-muted">To be decided</span>;
  return (
    <Link href={`/teams/${t.id}`} prefetch={false} transitionTypes={FORWARD} className="flex min-w-0 items-center gap-3">
      <TeamAvatar team={t} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-semibold text-blue">{t.name}</span>
        <span className="block truncate text-xs text-muted">{t.manager_name ?? ""}</span>
      </span>
    </Link>
  );
}

// An Intel page: slides in from the Intel list, a back bar on top, one card. Edge to edge on phones.
export function IntelPage({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Slide>
      <div className="-mb-6 min-h-[calc(100dvh-44px)] sm:mb-0 sm:min-h-0">
        <BackBar href="/league?view=intel" title={title} right={right} />
        <div className="-mx-4 border-b border-line bg-card sm:mx-0 sm:mt-3 sm:overflow-hidden sm:rounded-2xl sm:border">{children}</div>
      </div>
    </Slide>
  );
}
