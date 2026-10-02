"use client";
import Link from "next/link";
import { BACK } from "./Slide";
import { canGoBack, goBack } from "./NavTracker";

// The back arrow. With one of our pages behind this one it steps back in history (instant, the page slides back
// and keeps its scroll position); opened from an email or a fresh tab it opens `href`, the page above this one.
// `step` is for steps inside one flow (the trade builder): always open `href`, in place of this page in history.
export default function BackLink({ href, step, className = "", label = "Back" }: {
  href: string; step?: boolean; className?: string; label?: string;
}) {
  return (
    <Link
      href={href}
      replace={step}
      transitionTypes={BACK}
      aria-label={label}
      className={`group flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[background-color,scale] duration-150 hover:bg-fg/[0.06] active:scale-90 active:bg-fg/[0.1] ${className}`}
      onClick={(e) => {
        if (step || !canGoBack() || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        goBack();
      }}
    >
      <BackIcon />
    </Link>
  );
}

export function BackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className="transition-transform duration-200 ease-out group-hover:-translate-x-0.5 group-active:-translate-x-1">
      <path d="M15 4.5 7.5 12l7.5 7.5" />
    </svg>
  );
}
