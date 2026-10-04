// Injury news: what changed between what we knew and ESPN's league injury report, and how to say it. Pure.

export type InjuryChange = { playerId: string; name: string; from: string | null; to: string | null; note: string | null };

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// Every player whose status is different in the report: newly hurt, ruled out, upgraded, or gone from it (cleared).
// Returns null when the report looks cut short (ESPN hiccup): at least 10 players were hurt and fewer than half are
// still listed. Better to wait for the next report than to tell everyone their players are cleared.
export function injuryChanges(
  players: { id: string; name: string; injury_status: string | null }[],
  report: Map<string, { status: string; note: string | null }>,
): InjuryChange[] | null {
  const hurt = players.filter((p) => p.injury_status).length;
  if (hurt >= 10 && report.size < hurt / 2) return null;
  return players
    .filter((p) => !same(p.injury_status, report.get(p.id)?.status))
    .map((p) => ({ playerId: p.id, name: p.name, from: p.injury_status, to: report.get(p.id)?.status ?? null, note: report.get(p.id)?.note ?? null }));
}

// The notification for one change: "Trae Young: Out" with ESPN's note, or "Trae Young is off the injury report".
export function injuryMessage(c: InjuryChange): { title: string; body: string } {
  if (!c.to) return { title: `${c.name} is off the injury report`, body: "Cleared to play." };
  const note = (c.note ?? "").trim();
  return { title: `${c.name}: ${c.to}`, body: note.length > 170 ? `${note.slice(0, 167).trimEnd()}…` : note };
}
