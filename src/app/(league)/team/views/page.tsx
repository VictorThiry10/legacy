import { getSettings } from "@/lib/league";
import { isDay, today } from "@/lib/dates";
import { viewKey, views } from "@/lib/team-views";
import Slide from "@/components/Slide";
import BackBar from "@/components/BackBar";
import ReturnLink from "@/components/ReturnLink";

export const dynamic = "force-dynamic";

// Full screen list of stat views for the Team page (ESPN's "Views"). Slides in from the right; picking one slides
// back to the team with that view.
export default async function Views({ searchParams }: PageProps<"/team/views">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const back = str("back").startsWith("/team") ? str("back") : "/team";
  const day = isDay(str("d")) ? str("d") : today();
  const current = viewKey(str("stat"));
  const { season } = await getSettings();
  const to = (stat: string) => `${back}?${new URLSearchParams({ d: day, stat })}`;

  return (
    <Slide>
      <div className="-mb-6 min-h-[calc(100dvh-44px)] sm:mb-0 sm:min-h-0">
        <BackBar href={to(current)} title="Views" />
        <ul className="-mx-4 divide-y divide-line border-b border-line bg-card sm:mx-0 sm:mt-3 sm:overflow-hidden sm:rounded-2xl sm:border">
          {views(day, season).map((v) => (
            <li key={v.key}>
              <ReturnLink href={to(v.key)} changed={v.key !== current} className={`flex items-center justify-between px-4 py-4 text-base active:bg-fg/[0.04] ${v.key === current ? "text-accent" : ""}`}>
                {v.label}
                {v.key === current && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
                )}
              </ReturnLink>
            </li>
          ))}
        </ul>
      </div>
    </Slide>
  );
}
