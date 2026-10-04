import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

// The rookie class, best first, and what each one costs.
export type Rookie = { id: string; name: string; position: string; nba: string; salary: number }; // id: ESPN's
const M = 1_000_000;
export const ROOKIES: Rookie[] = [
  { id: "5142718", name: "AJ Dybantsa", position: "SF", nba: "WSH", salary: 5 * M },
  { id: "5041935", name: "Cameron Boozer", position: "PF", nba: "MEM", salary: 4 * M },
  { id: "5041955", name: "Darryn Peterson", position: "PG, SG", nba: "UTAH", salary: 3 * M },
  { id: "5095151", name: "Caleb Wilson", position: "SF", nba: "CHI", salary: 3 * M },
  { id: "5142620", name: "Darius Acuff Jr.", position: "PG", nba: "SAC", salary: 3 * M },
  { id: "5254165", name: "Keaton Wagler", position: "PG, SG", nba: "LAC", salary: 2 * M },
  { id: "5101761", name: "Mikel Brown Jr.", position: "PG", nba: "BKN", salary: 2 * M },
  { id: "5149077", name: "Kingston Flemings", position: "PG, SG", nba: "ATL", salary: 2 * M },
];

// TEST ONLY: the draft that follows the lottery, kept in this browser. Nothing is signed and nobody else sees it.
// The teams ahead of me "pick" one every PACE ms, each taking the best rookie left, until it's my turn.
export type TestDraft = { order: { name: string; color: string }[]; at: number; mine?: string }; // mine: the rookie I took
const KEY = "rookie-draft-test";
const PACE = 8000;

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage switched off: no test draft
  }
};
const watch = (changed: () => void) => {
  window.addEventListener(KEY, changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener(KEY, changed);
    window.removeEventListener("storage", changed);
  };
};
export function saveDraft(d: TestDraft | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(KEY));
}

// Where the draft stands at `now`: my pick, the pick on the clock, and who took whom.
function draftAt(d: TestDraft, me: string, now: number) {
  const myPick = d.order.findIndex((t) => t.name === me) + 1;
  const ahead = d.mine ? myPick - 1 : Math.max(0, Math.min(myPick - 1, Math.floor((now - d.at) / PACE)));
  const taken = new Map(ROOKIES.slice(0, ahead).map((r, k) => [r.id, d.order[k]]));
  if (d.mine) taken.set(d.mine, d.order[myPick - 1]);
  return { myPick, onClock: d.mine ? myPick + 1 : ahead + 1, myTurn: !d.mine && ahead + 1 === myPick, taken };
}

// The test draft, live: null when there isn't one. Ticks every second while teams ahead of me are picking.
export function useDraft(me: string) {
  const raw = useSyncExternalStore(watch, read, () => null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!raw) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [raw]);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as TestDraft;
      return { d, ...draftAt(d, me, now) };
    } catch {
      return null;
    }
  }, [raw, me, now]);
}
