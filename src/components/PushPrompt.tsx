"use client";
import { useEffect, useState } from "react";
import { pushSubscription, pushSupported, turnPushOn } from "./push-client";

const LATER = "push-later"; // remembered on this device when the GM says not now

// On the Team page, for a GM whose phone could get notifications but hasn't turned them on: one row, like the
// to-do card. It goes away once they're on, when dismissed, or if the phone has blocked them.
export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported() || Notification.permission === "denied") return;
    try {
      if (localStorage.getItem(LATER)) return;
    } catch {}
    pushSubscription().then((sub) => setShow(!(sub && Notification.permission === "granted"))).catch(() => {});
  }, []);

  if (!show) return null;
  const on = async () => {
    setBusy(true);
    const problem = await turnPushOn();
    setBusy(false);
    if (problem) setError(problem);
    else setShow(false);
  };
  const later = () => {
    try {
      localStorage.setItem(LATER, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crimson/10 text-crimson"><BellIcon /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-semibold">Notifications</span>
          <span className="mt-0.5 block text-xs text-muted">{error ?? "Trades and injury news, on this phone"}</span>
        </span>
        <button type="button" onClick={later} disabled={busy} className="shrink-0 px-1 text-xs text-muted">Not now</button>
        <button type="button" onClick={on} disabled={busy} className="shrink-0 rounded-full bg-crimson px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{busy ? "…" : "Turn on"}</button>
      </div>
    </div>
  );
}

export const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9ZM10 20a2 2 0 0 0 4 0" />
  </svg>
);
