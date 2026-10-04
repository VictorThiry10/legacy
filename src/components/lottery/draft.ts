import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ROOKIES, type Rookie } from "./rookies";

// TEST ONLY: the draft that follows the lottery, kept in this browser. Nothing is signed and nobody else sees it.
// The teams ahead of me "pick" one every PACE ms, each taking the best rookie left, until it's my turn.
export type TestDraft = { order: { name: string; color: string }[]; at: number; mine?: Rookie & { years: number } }; // mine: my pick
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
  if (d.mine) taken.set(d.mine.id, d.order[myPick - 1]);
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
