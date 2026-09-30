"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/", "Home"],
  ["/team", "Team"],
  ["/players", "Players"],
  ["/matchup", "Matchup"],
  ["/league", "League"],
] as const;

export default function Nav() {
  const path = usePathname();
  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/team" && path.startsWith("/teams/")));
  return (
    <>
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={`whitespace-nowrap ${on(href) ? "text-fg font-medium" : "text-muted hover:text-fg"}`}>{label}</Link>
      ))}
    </>
  );
}
