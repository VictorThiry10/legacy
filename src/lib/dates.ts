// Dates. The NBA (and so every lineup, game and matchup) runs on US Eastern days, as "YYYY-MM-DD" strings.

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etDay = (d: Date | string) => fmt.format(new Date(d));
export const today = () => etDay(new Date());

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// 0 = Sunday ... 6 = Saturday
export const weekdayIndex = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

const noon = (day: string) => new Date(`${day}T12:00:00Z`);
const show = (day: string, o: Intl.DateTimeFormatOptions) => noon(day).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
export const shortDate = (day: string) => show(day, { month: "short", day: "numeric" }).toUpperCase(); // OCT 20
export const monthDay = (day: string) => show(day, { month: "short", day: "numeric" }); // Oct 20
export const longDate = (day: string) => show(day, { month: "long", day: "numeric" }); // October 20
export const weekday = (day: string) => show(day, { weekday: "short" }).toUpperCase(); // TUE

const ROUND: Record<string, string> = { semi: "Semifinal", final: "Final" };
export const weekLabel = (m: { week: number; starts: string; ends: string; round?: string; is_test?: boolean }) =>
  `${m.is_test ? "Test · " : ""}${ROUND[m.round ?? ""] ?? `Week ${m.week}`} · ${monthDay(m.starts)} to ${monthDay(m.ends)}`;

export const minutesSince = (iso: string, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));

// How long ago a moment was, in words: "just now", "3 min ago", "2 h ago", "3 days ago".
export function ago(iso: string, now = Date.now()) {
  const m = minutesSince(iso, now);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}
