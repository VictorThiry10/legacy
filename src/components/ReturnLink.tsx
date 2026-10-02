"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACK } from "./Slide";
import { canGoBack, goBack } from "./NavTracker";

// A choice that returns to the page you came from with a new setting (the Views list): it steps back in history,
// sliding back, then swaps in `href` (left out when nothing changed). That keeps history clean, so the page's own
// back arrow still goes where you expect. Opened from outside the app, it just opens `href`.
export default function ReturnLink({ href, changed = true, className, children }: {
  href: string; changed?: boolean; className?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      transitionTypes={BACK}
      className={className}
      onClick={(e) => {
        if (!canGoBack() || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        goBack(changed ? () => router.replace(href, { scroll: false }) : undefined);
      }}
    >
      {children}
    </Link>
  );
}
