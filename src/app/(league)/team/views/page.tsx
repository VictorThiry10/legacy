import Link from "next/link";
import { getSettings } from "@/lib/league";
import { isDay, today } from "@/lib/dates";
import { viewKey, views } from "@/lib/team-views";
import Slide, { BACK } from "@/components/Slide";

export const dynamic = "force-dynamic";

// Full screen list of stat views for the Team page (ESPN's "Views"). Slides in from the right.
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
      <div className="-mx-4 -my-6 min-h-[calc(100dvh-44px)] bg-bg sm:mx-0 sm:my-0 sm:min-h-0">
        <div className="relative flex items-center justify-center border-b border-line bg-card px-4 py-4 shadow-sm">
          <h1 className="text-lg font-bold">Views</h1>
          <Link href={to(current)} transitionTypes={BACK} className="absolute right-4 text-sm font-medium">Close</Link>
        </div>
        <ul className="bg-card divide-y divide-line border-b border-line">
          {views(day, season).map((v) => (
            <li key={v.key}>
              <Link href={to(v.key)} transitionTypes={BACK} className={`flex items-center justify-between px-4 py-4 text-base ${v.key === current ? "text-accent" : ""}`}>
                {v.label}
                {v.key === current && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Slide>
  );
}
