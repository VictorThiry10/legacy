// Shown the moment a tab is tapped, while the page loads (also lets tabs be prefetched).
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-line" />
      <div className="h-4 w-72 rounded bg-line" />
      <div className="card space-y-3">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-8 rounded bg-line/70" />)}
      </div>
    </div>
  );
}
