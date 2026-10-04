import type { Move } from "@/lib/roster";
import { money } from "@/lib/rules";
import LocalTime from "./LocalTime";

// The transactions log. Trades show as one line per player or draft pick, grouped.
export default function Moves({ moves }: { moves: Move[] }) {
  if (!moves.length) return <p className="text-sm text-muted">No roster moves yet.</p>;
  return (
    <ul className="text-sm divide-y divide-line">
      {moves.map((m) => (
        <li key={m.id} className="py-2 flex flex-wrap gap-x-2">
          <span className="text-xs text-muted w-24 shrink-0"><LocalTime iso={m.created_at} mode="date" /></span>
          <span className="flex-1 min-w-0">
            {m.kind === "sign" && <><b>{m.team}</b> signed {m.player} · {money(m.salary ?? 0)}, {m.years}yr</>}
            {m.kind === "release" && <><b>{m.team}</b> released {m.player}</>}
            {m.kind === "trade" && <><b>{m.team}</b> got {m.player} from {m.other_team} · {money(m.salary ?? 0)}</>}
            {m.kind === "pick" && <><b>{m.team}</b> got the {m.player} from {m.other_team}</>}
            {m.note && <span className="block text-xs text-muted">{m.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
