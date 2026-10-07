"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Full width search box (ESPN style): filters as you type, Cancel goes back to the filter row.
export default function SearchBar({ path, params, initial, cancelHref }: { path: string; params: Record<string, string>; initial: string; cancelHref: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const last = useRef(initial.trim());
  // Compared as text: the page sends a fresh copy of the same filters after every update.
  const base = new URLSearchParams(params).toString();
  useEffect(() => {
    const term = q.trim();
    if (term === last.current) return;
    const t = setTimeout(() => {
      last.current = term;
      const next = new URLSearchParams(base);
      next.set("search", "1");
      if (term) next.set("q", term);
      router.replace(`${path}?${next}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, path, base, router]);
  return (
    <form className="flex items-center gap-3" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-1 items-center gap-2 rounded-full border-2 border-accent/60 bg-line/60 px-4 py-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." autoFocus enterKeyHint="search" className="w-full bg-transparent text-base outline-none" />
      </label>
      <Link href={cancelHref} className="text-sm font-medium text-accent">Cancel</Link>
    </form>
  );
}
