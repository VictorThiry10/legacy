"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Small tab row inside a section (e.g. Settings: League / Rosters / Schedule).
export default function SubNav({ tabs }: { tabs: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-5 border-b border-line text-sm">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={`pb-2 -mb-px border-b-2 ${path === href ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
