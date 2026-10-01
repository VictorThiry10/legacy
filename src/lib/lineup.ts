// Lineup rules: slots, who can play where, and how a saved lineup fills out. Pure functions, easy to test.

export const SLOTS = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL1", "UTIL2", "UTIL3", "BE1", "BE2", "BE3", "IR"] as const;
export type Slot = (typeof SLOTS)[number];

export const slotLabel = (s: string) => (s.startsWith("BE") ? "Bench" : s.replace(/\d$/, ""));
export const isStarter = (s: string) => !s.startsWith("BE") && s !== "IR";
export const isSlot = (s: string): s is Slot => (SLOTS as readonly string[]).includes(s);

// ESPN positions -> the position slots they can fill (UTIL and bench take anyone).
const FITS: Record<string, string[]> = {
  PG: ["PG", "G"], SG: ["SG", "G"], SF: ["SF", "F"], PF: ["PF", "F"], C: ["C"],
  G: ["PG", "SG", "G"], F: ["SF", "PF", "F"],
};

export const irEligible = (injury: string | null) => !!injury && /^out$|injured reserve/i.test(injury.trim());

export type LineupPlayer = { id: string; position: string | null; injury_status: string | null };

export function canPlay(p: LineupPlayer, slot: string): boolean {
  if (slot.startsWith("BE") || slot.startsWith("UTIL")) return true;
  if (slot === "IR") return irEligible(p.injury_status);
  const positions = (p.position ?? "").toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  return positions.some((pos) => (FITS[pos] ?? []).includes(slot));
}

export type LineupRow = { slot: string; playerId: string | null };

/**
 * The lineup a team fields on a day.
 * `saved` is the latest save on or before that day (empty if the team never saved one).
 * `roster` is in priority order (best first): with no save, it fills starters greedily, then the bench.
 * Saved players who left the roster are dropped; new players go to open bench spots, then any open slot they fit.
 * Players who fit nowhere come back as extra bench rows so nobody disappears.
 */
export function buildLineup(saved: { slot: string; playerId: string }[], roster: LineupPlayer[]): LineupRow[] {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const at = new Map<string, string>();
  const placed = new Set<string>();
  for (const s of saved) {
    if (!isSlot(s.slot) || at.has(s.slot) || placed.has(s.playerId) || !byId.has(s.playerId)) continue;
    at.set(s.slot, s.playerId);
    placed.add(s.playerId);
  }
  const put = (slots: readonly string[]) => {
    for (const p of roster) {
      if (placed.has(p.id)) continue;
      const slot = slots.find((s) => !at.has(s) && canPlay(p, s));
      if (slot) {
        at.set(slot, p.id);
        placed.add(p.id);
      }
    }
  };
  const starters = SLOTS.filter(isStarter);
  const bench = SLOTS.filter((s) => s.startsWith("BE"));
  if (!saved.length) {
    // fill the most specific slots first so a PG isn't wasted at UTIL
    for (const s of starters) put([s]);
  }
  put(bench);
  put(starters);
  const rows: LineupRow[] = SLOTS.map((slot) => ({ slot, playerId: at.get(slot) ?? null }));
  for (const p of roster) if (!placed.has(p.id)) rows.splice(rows.length - 1, 0, { slot: "BE", playerId: p.id });
  return rows;
}

/** Swap the player in `from` with whatever is in `to`. Returns an error message, or the new lineup. */
export function swap(rows: LineupRow[], playerId: string, to: string, players: Map<string, LineupPlayer>): LineupRow[] | string {
  const i = rows.findIndex((r) => r.playerId === playerId);
  const j = rows.findIndex((r) => r.slot === to);
  if (i < 0) return "That player is not on this lineup.";
  if (j < 0 || !isSlot(to)) return "Unknown slot.";
  const moving = players.get(playerId)!;
  if (!canPlay(moving, to)) return `${slotLabel(to)} is not a valid slot for this player.`;
  const other = rows[j].playerId ? players.get(rows[j].playerId!) : null;
  const back = rows[i].slot;
  if (other && !canPlay(other, back)) return `The player in ${slotLabel(to)} can't move to ${slotLabel(back)}.`;
  const next = rows.map((r) => ({ ...r }));
  next[j].playerId = playerId;
  next[i].playerId = other?.id ?? null;
  return next;
}

type Placed = { slot: string; playerId: string };

/**
 * The lineup to freeze for a day, with each player's slot locked at his tip-off.
 * `built` is the lineup from the saves and the current roster; `frozen` is what was frozen earlier that day
 * (empty the first time); `tip(id)` is the player's tip-off time if his game has started; `savedAt` is when the
 * save behind `built` was made (null when the team never saved one).
 * - Players whose game hasn't started: as built.
 * - Started players: keep their frozen slot, even if since dropped or traded (their points stay with this team),
 *   unless a save made before their tip-off puts them elsewhere (a move just before tip-off counts).
 * - Started players who weren't frozen with this team (picked up after their game): left out for the day.
 * Locked players win their slot; anyone else built into it sits out that day.
 */
export function freezeLineup(built: LineupRow[], frozen: Placed[], tip: (playerId: string) => number | undefined, savedAt: number | null): Placed[] {
  const rows = built.filter((r): r is Placed => !!r.playerId);
  if (!frozen.length) return rows;
  const out = new Map<string, string>(); // slot -> player
  const placed = new Set<string>();
  const put = (slot: string, playerId: string) => {
    if (out.has(slot) || placed.has(playerId)) return;
    out.set(slot, playerId);
    placed.add(playerId);
  };
  const builtSlot = new Map(rows.map((r) => [r.playerId, r.slot]));
  for (const f of frozen) {
    const t = tip(f.playerId);
    if (t === undefined) continue;
    const before = savedAt !== null && savedAt <= t && builtSlot.has(f.playerId);
    put(before ? builtSlot.get(f.playerId)! : f.slot, f.playerId);
  }
  const wasFrozen = new Set(frozen.map((f) => f.playerId));
  for (const r of rows) if (tip(r.playerId) === undefined || wasFrozen.has(r.playerId)) put(r.slot, r.playerId);
  return [...out].map(([slot, playerId]) => ({ slot, playerId }));
}
