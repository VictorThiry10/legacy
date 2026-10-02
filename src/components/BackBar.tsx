import BackLink from "./BackLink";

// The top of every page inside a tab: the back arrow, the title with a line under it, an optional button on the
// right. Edge to edge on phones and pinned under the tab bar. It stays put while the page under it slides
// (its own view transition name, see globals.css). Pages put it first, before their content.
export default function BackBar({ href, step, title, sub, right }: {
  href: string; step?: boolean; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div
      className="sticky top-11 z-20 -mx-4 -mt-6 flex min-h-14 items-center gap-1.5 border-b border-line bg-card/95 py-1.5 pl-1.5 pr-4 backdrop-blur sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border"
      style={{ viewTransitionName: "back-bar" }}
    >
      <BackLink href={href} step={step} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[17px] font-semibold">{title}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
