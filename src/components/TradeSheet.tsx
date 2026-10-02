import { money } from "@/lib/rules";
import { headshot } from "@/lib/names";
import type { RosterPlayer } from "@/lib/roster";
import TeamAvatar from "./TeamAvatar";
import { TradeIcon } from "./PendingRow";

type Side = { name: string; space: number }; // a team and its cap space today

const total = (ps: RosterPlayer[]) => ps.reduce((a, p) => a + p.salary, 0);
const cap = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

// One trade, both teams in one card: the two teams side by side, then what each team gets, then both teams' cap
// space before and after. My side is blue and theirs orange all the way down (the header fades from one to the
// other, a colour edge marks each half), so the sides read apart even when two teams' badges look alike.
// Used by the trade builder's summary and the offer page. `get` is what I get, `give` what I give.
export default function TradeSheet({ me, them, get, give, showCap = true }: {
  me: Side; them: Side; get: RosterPlayer[]; give: RosterPlayer[]; showCap?: boolean;
}) {
  const net = total(get) - total(give); // my salary change
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-gradient-to-r from-blue/15 to-orange/15 px-4 py-4">
        <TeamHead name={me.name} note="You" tone="text-blue" />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-fg shadow-sm">
          <TradeIcon />
        </span>
        <TeamHead name={them.name} note="Them" tone="text-orange" />
      </div>

      <Half team={me.name} edge="bg-blue" label="You get" players={get} />
      <Half team={them.name} edge="bg-orange" label={`${them.name} get`} players={give} />

      {showCap && (
        <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
          <Cap dot="bg-blue" before={me.space} after={me.space - net} />
          <Cap dot="bg-orange" before={them.space} after={them.space + net} />
        </div>
      )}
    </div>
  );
}

function TeamHead({ name, note, tone }: { name: string; note: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamAvatar name={name} size="lg" />
      <div className="w-full min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className={`text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{note}</div>
      </div>
    </div>
  );
}

// What one team gets, with its side's colour down the left edge.
function Half({ team, edge, label, players }: { team: string; edge: string; label: string; players: RosterPlayer[] }) {
  return (
    <section className="relative border-t border-line pb-1.5">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${edge}`} />
      <div className="flex items-center justify-between gap-3 py-2.5 pl-5 pr-4">
        <span className="flex min-w-0 items-center gap-2">
          <TeamAvatar name={team} size="sm" />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide">{label}</span>
        </span>
        <span className="num shrink-0 text-xs text-muted">{money(total(players))}</span>
      </div>
      {players.map((p) => (
        <div key={p.contract_id} className="flex items-center gap-3 py-1.5 pl-5 pr-4">
          {p.headshot
            ? <img src={headshot(p.headshot, 110)!} alt="" loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-full bg-line object-cover" />
            : <span className="h-9 w-9 shrink-0 rounded-full bg-line" />}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[15px] font-medium">{p.name}</span>
            <span className="block truncate text-[11px] text-muted">
              {p.nba_team} · {p.position}{p.injury_status && <span className="text-bad"> · {p.injury_status}</span>}
            </span>
          </span>
          <span className="num shrink-0 text-sm font-semibold">{money(p.salary)}</span>
        </div>
      ))}
      {!players.length && <p className="py-1.5 pl-5 pr-4 text-sm text-muted">Nobody</p>}
    </section>
  );
}

// One team's cap space, today and after the trade.
function Cap({ dot, before, after }: { dot: string; before: number; after: number }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-[11px] uppercase tracking-wide text-muted">Cap space</span>
      </div>
      <div className="num mt-1 flex items-baseline gap-1.5 text-sm">
        <span className="text-muted">{cap(before)}</span>
        <span className="text-muted">→</span>
        <span className={`text-base font-bold ${after < 0 ? "text-bad" : ""}`}>{cap(after)}</span>
      </div>
      <div className={`num text-xs ${after < before ? "text-muted" : "text-good"}`}>{after === before ? "No change" : signed(after - before)}</div>
    </div>
  );
}
