"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Small tab row inside a section (e.g. Settings: League / Rosters / Schedule). `replace` swaps tabs in place in
// history, so the section's back arrow leaves the section instead of walking back through its tabs.
export default function SubNav({ tabs, replace }: { tabs: [string, string][]; replace?: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex gap-5 border-b border-line text-sm">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} replace={replace} className={`pb-2 -mb-px border-b-2 ${path === href ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
