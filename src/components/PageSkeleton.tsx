"use client";
import { ViewTransition } from "react";
import { usePathname } from "next/navigation";
import BackLink from "./BackLink";
import { DIRECTIONS } from "./Slide";

const TABS = ["/", "/team", "/matchup", "/players", "/league"];

// What a page shows while it loads ((league)/loading.tsx). It slides in like the page would. When the page arrives
// the skeleton fades out as the page fades in, rather than the page popping in. Pages inside a tab get the back bar
// (a working arrow, so you can leave before it loads), so the real bar lands in the same place.
export default function PageSkeleton() {
  const path = usePathname();
  const sub = !TABS.includes(path);
  return (
    <ViewTransition enter={DIRECTIONS} exit={{ ...DIRECTIONS, default: "skeleton-out" }} default="none">
      <div aria-label="Loading">
        {sub && (
          <div
            className="sticky top-11 z-20 -mx-4 -mt-6 flex min-h-14 items-center gap-1.5 border-b border-line bg-card/95 py-1.5 pl-1.5 pr-4 backdrop-blur sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border"
            style={{ viewTransitionName: "back-bar" }}
          >
            <BackLink href="/team" />
            <div className="h-4 w-36 animate-pulse rounded bg-line" />
          </div>
        )}
        <div className={`animate-pulse ${sub ? "mt-4" : "-mx-4 -mt-6 sm:mx-0 sm:mt-0"}`}>
          {!sub && (
            <div className="border-b border-line bg-card px-4 py-4 sm:rounded-t-2xl">
              <div className="h-6 w-40 rounded bg-line" />
              <div className="mt-2 h-3.5 w-64 max-w-full rounded bg-line/70" />
            </div>
          )}
          <div className={`divide-y divide-line/60 bg-card ${sub ? "-mx-4 border-y border-line sm:mx-0 sm:rounded-2xl sm:border" : "sm:rounded-b-2xl"}`}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-line" />
                <div className="h-4 flex-1 rounded bg-line/70" />
                <div className="h-4 w-10 rounded bg-line/70" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ViewTransition>
  );
}
