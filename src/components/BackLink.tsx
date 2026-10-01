"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACK } from "./Slide";
import { cameFromApp } from "./NavTracker";

// A close or back button: when you got here from inside the app it goes back in history (instant, and the
// list you came from keeps its scroll position). Opened from a link elsewhere, it goes to `href` instead.
export default function BackLink({ href, className, children, label }: { href: string; className?: string; children: React.ReactNode; label?: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      transitionTypes={BACK}
      className={className}
      aria-label={label}
      onClick={(e) => {
        if (!cameFromApp()) return;
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
