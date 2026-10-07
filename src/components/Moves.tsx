import Link from "next/link";
import { describe, type Move } from "@/lib/moves";
import LocalTime from "./LocalTime";
import { FORWARD } from "./Slide";

// The transactions log, newest first. Trades show as one line per player or draft pick, grouped.
export default function Moves({ moves }: { moves: Move[] }) {
  if (!moves.length) return <p className="px-4 py-6 text-center text-sm text-muted">No moves yet.</p>;
  return (
    <ul className="divide-y divide-line/60 text-sm">
      {moves.map((m) => {
        const d = describe(m);
        return (
          <li key={m.id} className="flex gap-x-3 px-4 py-2.5">
            <span className="w-16 shrink-0 pt-px text-xs text-muted"><LocalTime iso={m.created_at} mode="day" /></span>
            <span className="min-w-0 flex-1 leading-snug">
              <b>{m.team}</b> {d.verb}{" "}
              {m.player_id ? <Link href={`/players/${m.player_id}`} prefetch={false} transitionTypes={FORWARD} className="text-blue">{m.player}</Link> : m.player}
              {d.tail}
              {d.detail && <span className="num text-muted"> · {d.detail}</span>}
              {m.note && <span className="block text-xs text-muted">{m.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
