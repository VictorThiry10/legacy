import Link from "next/link";
import type { ReactNode } from "react";

// One line of the Team page's to-do card (Pending.tsx). With an `action` it's waiting on me (a crimson button that
// says what to do), without one it's waiting on someone else (grey, a chevron). Opens a page (`href`) or a pop-up (`onClick`).
export default function PendingRow({ href, onClick, icon, title, sub, action }: {
  href?: string; onClick?: () => void; icon: ReactNode; title: ReactNode; sub: ReactNode; action?: string;
}) {
  const inner = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${action ? "bg-crimson/10 text-crimson" : "bg-fg/[0.06] text-muted"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>
      </span>
      {action ? (
        <span className="shrink-0 rounded-full bg-crimson px-3.5 py-1.5 text-xs font-semibold text-white">{action}</span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-muted"><path d="m9 6 6 6-6 6" /></svg>
      )}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fg/[0.03] active:bg-fg/[0.06]";
  return href ? <Link href={href} transitionTypes={["nav-forward"]} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

const icon = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
export const TradeIcon = () => icon(<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />);
export const ContractIcon = () => icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>);
