// Stat views for the Team page (the "Views" list). Pure, shared by the Team page and the Views page.
import { monthDay, weekday } from "./dates";

export type ViewKey = "day" | "7" | "15" | "30" | "season" | "last";
const KEYS: ViewKey[] = ["day", "7", "15", "30", "season", "last"];

export const viewKey = (s: string | undefined): ViewKey => (KEYS.includes(s as ViewKey) ? (s as ViewKey) : "season");
const seasonName = (start: number) => `${start}–${String(start + 1).slice(2)}`;

export function views(day: string, season: number): { key: ViewKey; label: string }[] {
  const dayName = `${weekday(day).charAt(0)}${weekday(day).slice(1).toLowerCase()}, ${monthDay(day)}`;
  return [
    { key: "day", label: `${dayName} Stats` },
    { key: "7", label: "7 Day Stats" },
    { key: "15", label: "15 Day Stats" },
    { key: "30", label: "30 Day Stats" },
    { key: "season", label: `${seasonName(season)} Stats` },
    { key: "last", label: `${seasonName(season - 1)} Stats` },
  ];
}
