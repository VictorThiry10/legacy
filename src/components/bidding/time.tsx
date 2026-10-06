"use client";
import { useSyncExternalStore } from "react";
import { useClock } from "./clock";

// Times on the bidding site are shown in each GM's own time zone, which only the browser knows.

const never = () => () => {};
// False while the server renders and during the first paint, true from then on.
export const useInBrowser = () => useSyncExternalStore(never, () => true, () => false);

type Style = "day" | "time" | "date";
const FORMATS: Record<Style, Intl.DateTimeFormatOptions> = {
  day: { weekday: "short", hour: "numeric", minute: "2-digit" }, // Mon 8:00
  time: { hour: "numeric", minute: "2-digit" }, // 18:00
  date: { weekday: "short", day: "numeric", month: "short" }, // Mon 12 Oct
};
export const formatWhen = (iso: string, style: Style = "day") => new Intl.DateTimeFormat(undefined, FORMATS[style]).format(new Date(iso));

// A moment in the viewer's time zone. Empty until the browser fills it in.
export function When({ iso, style = "day" }: { iso: string | null; style?: Style }) {
  const text = useSyncExternalStore(never, () => (iso ? formatWhen(iso, style) : ""), () => "");
  return <>{text}</>;
}

// Whole seconds left until `target` (ms), on the server's clock: re-renders once a second.
export const useSecondsLeft = (target: number, skew: number, serverNow: number) =>
  useClock((now) => Math.max(0, Math.ceil((target - now - skew) / 1000)) || 0, serverNow);

// "2d 05h", "9:59:12" or "4:07": as long as it needs to be.
export function left(secs: number) {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return d ? `${d}d ${two(h)}h` : h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

// A small running countdown to `iso`.
export function TimeLeft({ iso, skew, serverNow }: { iso: string; skew: number; serverNow: number }) {
  return <span className="tabular-nums">{left(useSecondsLeft(Date.parse(iso), skew, serverNow))}</span>;
}
