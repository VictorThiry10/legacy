import { Suspense } from "react";
import Nav from "@/components/Nav";
import { getMe } from "@/lib/auth";
import { extensionOffer } from "@/lib/extensions";
import type { Team } from "@/lib/league";
import TimeZone from "@/components/TimeZone";
import NavTracker from "@/components/NavTracker";
import Extensions from "@/components/Extensions";
import LotteryPopup from "@/components/lottery/Popup";
import { lotteryPrompt } from "@/lib/draft";
import SchedulePopup from "@/components/schedule/Popup";
import { scheduleRelease } from "@/lib/schedule-release";
import ConferencesPopup from "@/components/conferences/Popup";
import { conferenceReveal } from "@/lib/conference-reveal";

// The league app: tab bar on top once you have a team.
export default async function LeagueLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  return (
    <>
      {me?.team && (
        <header className="sticky top-0 z-30 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.12)]" style={{ viewTransitionName: "site-header" }}>
          <Nav />
        </header>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      {me?.team && (
        <Suspense fallback={null}>
          <ExtensionsPrompt team={me.team} />
        </Suspense>
      )}
      {me?.team && (
        <Suspense fallback={null}>
          <LotteryPrompt team={me.team} />
        </Suspense>
      )}
      {me?.team && (
        <Suspense fallback={null}>
          <SchedulePrompt team={me.team} />
        </Suspense>
      )}
      {me?.team && (
        <Suspense fallback={null}>
          <ConferencesPrompt team={me.team} />
        </Suspense>
      )}
      <TimeZone />
      <NavTracker />
    </>
  );
}

// The one-off contract extensions pop-up (lib/extensions.ts). It never holds up or breaks the page.
async function ExtensionsPrompt({ team }: { team: Team }) {
  const offer = await extensionOffer(team).catch(() => null);
  return offer ? <Extensions offer={offer} /> : null;
}

// The schedule release show, once per GM, once the real schedule is built (lib/schedule-release.ts). It never holds
// up or breaks the page.
async function SchedulePrompt({ team }: { team: Team }) {
  const data = await scheduleRelease(team).catch(() => null);
  return data ? <SchedulePopup data={data} /> : null;
}

// The conferences reveal, once per GM, after the schedule release (lib/conference-reveal.ts). It never holds up or
// breaks the page.
async function ConferencesPrompt({ team }: { team: Team }) {
  const data = await conferenceReveal(team).catch(() => null);
  return data ? <ConferencesPopup data={data} /> : null;
}

// The rookie lottery pop-up, until this GM has watched it (lib/draft.ts). It never holds up or breaks the page.
async function LotteryPrompt({ team }: { team: Team }) {
  const field = await lotteryPrompt(team).catch(() => null);
  return field ? <LotteryPopup field={field} /> : null;
}
