"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/team", "Team"],
  ["/matchup", "Matchup"],
  ["/players", "Players"],
  ["/league", "League"],
] as const;

// Main tabs, evenly spaced, 44px tall (pages can stick things right below: top-11). A thin crimson line slides
// to the open tab, and moves the moment a tab is tapped, before its page arrives. Tabs are prefetched in full.
export default function Nav() {
  const path = usePathname();
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const on = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/team" && (path === "/" || path.startsWith("/teams/"))) || (href === "/league" && path.startsWith("/settings"));
  const active = tapped?.from === path ? TABS.findIndex(([h]) => h === tapped.href) : TABS.findIndex(([h]) => on(h));
  return (
    <nav className="relative mx-auto grid max-w-7xl grid-cols-4">
      {TABS.map(([href, label], i) => (
        <Link
          key={href}
          href={href}
          prefetch={true}
          onClick={() => setTapped({ href, from: path })}
          className={`flex h-11 items-center justify-center text-[13px] font-semibold uppercase tracking-wide transition-colors duration-200 ${i === active ? "text-fg" : "text-muted hover:text-fg"}`}
        >
          {label}
        </Link>
      ))}
      {active >= 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-1/4 bg-crimson transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(${active * 100}%)` }}
        />
      )}
    </nav>
  );
}
