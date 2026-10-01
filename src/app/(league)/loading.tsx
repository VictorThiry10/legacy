// Shown the moment a page starts loading (also lets tabs be prefetched). Full width like most pages, so nothing jumps.
export default function Loading() {
  return (
    <div className="-mx-4 -mt-6 animate-pulse sm:mx-0 sm:mt-0" aria-label="Loading">
      <div className="border-b border-line bg-card px-4 py-4 sm:rounded-t-2xl">
        <div className="h-6 w-40 rounded bg-line" />
        <div className="mt-2 h-3.5 w-64 max-w-full rounded bg-line/70" />
      </div>
      <div className="divide-y divide-line/60 bg-card sm:rounded-b-2xl">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-8 w-8 shrink-0 rounded-full bg-line" />
            <div className="h-4 flex-1 rounded bg-line/70" />
            <div className="h-4 w-10 rounded bg-line/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
