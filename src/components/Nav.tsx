"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/team", "Team"],
  ["/matchup", "Matchup"],
  ["/players", "Players"],
  ["/league", "League"],
] as const;

// Main tabs, evenly spaced. The open tab gets a thin crimson line underneath.
export default function Nav() {
  const path = usePathname();
  const on = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/team" && (path === "/" || path.startsWith("/teams/"))) || (href === "/league" && path.startsWith("/settings"));
  return (
    <nav className="mx-auto max-w-7xl grid grid-cols-4">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={`py-2.5 text-center text-[13px] font-semibold uppercase tracking-wide border-b-2 ${on(href) ? "border-crimson text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
