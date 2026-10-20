// Quick lineup: the best starting lineup from what a team has, like ESPN's "Quick Lineup" button. Pure, tested.
import { irEligible, isStarter, SLOTS, canPlay, type LineupPlayer, type LineupRow } from "./lineup";

export type QuickInput = {
  value: (playerId: string) => number; // projected fantasy points per game
  plays: (playerId: string) => boolean; // has an NBA game that day
  locked: (playerId: string) => boolean; // his game has started: he stays where he is
};

/**
 * Rearranges one day's lineup: the most valuable players who have a game (and aren't out) start, the rest sit.
 * Locked players keep their slot, IR is left alone. Among the players who could start, the set with the highest
 * total value that fits the position slots wins (greedy by value, re-routing earlier picks when a slot is contested),
 * so a cheap guard never blocks a star at UTIL.
 */
export function quickLineup(rows: LineupRow[], players: Map<string, LineupPlayer>, q: QuickInput): LineupRow[] {
  const keep = new Map<string, string>(); // slot -> player who stays (locked, or on IR)
  const free: string[] = [];
  for (const r of rows) {
    if (!r.playerId) continue;
    if (r.slot === "IR" || q.locked(r.playerId)) keep.set(r.slot, r.playerId);
    else free.push(r.playerId);
  }
  // no game, or out: worth nothing today (ties keep value order so the bench still reads best first)
  const score = (id: string) => (q.plays(id) && !irEligible(players.get(id)?.injury_status ?? null) ? q.value(id) : 0);
  const was = new Map(rows.map((r, i) => [r.playerId, i]));
  const ranked = [...free].sort((a, b) =>
    score(b) - score(a) || Number(isStarter(rows[was.get(b)!].slot)) - Number(isStarter(rows[was.get(a)!].slot)) || was.get(a)! - was.get(b)!,
  );
  const open = SLOTS.filter((s) => isStarter(s) && !keep.has(s));
  const at = new Map<string, string>(); // slot -> player
  // Kuhn's augmenting path: a free slot he fits (most specific first), else bump an occupant to his next slot.
  const place = (id: string, seen: Set<string>): boolean => {
    const fits = open.filter((s) => !seen.has(s) && canPlay(players.get(id)!, s));
    const free = fits.find((s) => !at.has(s));
    if (free) {
      at.set(free, id);
      return true;
    }
    for (const s of fits) {
      seen.add(s);
      if (place(at.get(s)!, seen)) {
        at.set(s, id);
        return true;
      }
    }
    return false;
  };
  const bench: string[] = [];
  for (const id of ranked) if (!(score(id) > 0 && place(id, new Set()))) bench.push(id);
  // the rest fill the starter slots still open (nothing to gain, but nobody sits for an empty slot), then the bench
  const left: string[] = [];
  for (const id of bench) if (!place(id, new Set())) left.push(id);
  const out: LineupRow[] = SLOTS.map((slot) => ({ slot, playerId: keep.get(slot) ?? at.get(slot) ?? null }));
  for (const r of out) if (r.slot.startsWith("BE") && !r.playerId && left.length) r.playerId = left.shift()!;
  for (const id of left) out.splice(out.length - 1, 0, { slot: "BE", playerId: id });
  return out;
}
