import { Suspense } from "react";
import Nav from "@/components/Nav";
import { getMe } from "@/lib/auth";
import { extensionOffer } from "@/lib/extensions";
import type { Team } from "@/lib/league";
import TimeZone from "@/components/TimeZone";
import NavTracker from "@/components/NavTracker";
import Extensions from "@/components/Extensions";
import LotteryPopup from "@/components/lottery/Popup";
import { inLotteryTest } from "@/components/lottery/teams";

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
      {/* the rookie lottery pop-up: a test for now, with random odds */}
      {me?.team && inLotteryTest(me.team.id) && <LotteryPopup />}
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
