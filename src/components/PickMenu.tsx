"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export type PickItem = { label: string; href: string; on?: boolean };

// ESPN style picker: tap the label, a menu drops under it with a little pointer, the page dims, the current
// choice has a tick. Used for the day on Matchup and the week on the Scoreboard.
export default function PickMenu({ label, items, className = "", width = 240 }: { label: React.ReactNode; items: PickItem[]; className?: string; width?: number }) {
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const close = () => setAt(null);

  // Any scroll or resize closes it (it's placed where the label was when opened).
  useEffect(() => {
    if (!at) return;
    const off = () => setAt(null);
    window.addEventListener("scroll", off, { passive: true, once: true });
    window.addEventListener("resize", off, { once: true });
    return () => {
      window.removeEventListener("scroll", off);
      window.removeEventListener("resize", off);
    };
  }, [at]);

  const open = () => {
    const r = button.current!.getBoundingClientRect();
    setAt({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const w = at ? Math.min(width, window.innerWidth - 24) : width;
  const left = at ? Math.min(Math.max(12, at.x - w / 2), window.innerWidth - w - 12) : 0;
  // Opens upwards when there isn't room below the label (rows are about 49 px; the list scrolls past 60% of the screen).
  const tall = Math.min(items.length * 49 + 8, (at ? window.innerHeight : 0) * 0.6);
  const up = !!at && at.bottom + 12 + tall > window.innerHeight - 12 && at.top > window.innerHeight - at.bottom;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (at ? close() : open())}
        aria-expanded={!!at}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1 font-semibold text-accent transition-opacity active:opacity-60 ${className}`}
      >
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={`transition-transform duration-200 ${at ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {at &&
        createPortal(
          <div className="fixed inset-0 z-50">
            {/* a real button, so a tap anywhere outside closes it (iOS ignores taps on plain divs) */}
            <button type="button" aria-label="Close" onClick={close} className="menu-dim absolute inset-0 cursor-default bg-black/45" />
            <div
              role="menu"
              className={`menu-pop absolute rounded-2xl bg-card shadow-2xl ring-1 ring-line ${up ? "menu-pop-up" : ""}`}
              style={up ? { bottom: window.innerHeight - at.top + 12, left, width: w } : { top: at.bottom + 12, left, width: w }}
            >
              <span className={`absolute h-3.5 w-3.5 rotate-45 rounded-sm bg-card ${up ? "-bottom-1.5" : "-top-1.5"}`} style={{ left: at.x - left - 7 }} />
              <ul className="relative max-h-[60dvh] overflow-y-auto overscroll-contain py-1">
                {items.map((it) => (
                  <li key={`${it.label}|${it.href}`} className="border-b border-line/70 last:border-0">
                    <Link
                      href={it.href}
                      role="menuitem"
                      scroll={false}
                      prefetch={false}
                      onClick={close}
                      className={`flex items-center gap-2 px-4 py-3 text-[17px] transition-colors active:bg-line/60 ${it.on ? "text-blue" : ""}`}
                    >
                      <span className="w-5 shrink-0 text-blue">{it.on ? "✓" : ""}</span>
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
