"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { monthGrid, monthsBetween, monthTitle } from "@/lib/calendar";
import { BACK, FORWARD } from "./Slide";

const full = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

// The date in the middle of the day row. Tap it for a calendar of the season; pick a day to jump there.
export default function DatePicker({ day, today, label, path, params, from, to }: {
  day: string; today: string; label: string; path: string; params: Record<string, string>; from: string; to: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) selected.current?.scrollIntoView({ block: "start" });
  }, [open]);
  const months = monthsBetween(day < from ? day : from, day > to ? day : to);
  const href = (d: string) => `${path}?${new URLSearchParams({ ...params, d })}`;

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-base font-semibold text-accent">{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-accent px-4 py-6 text-center text-2xl font-medium text-bg">{full(day)}</div>
            <div className="max-h-[60dvh] overflow-y-auto px-3 pb-4">
              {months.map((m) => {
                const here = day.slice(0, 7) === `${m.year}-${String(m.month).padStart(2, "0")}`;
                return (
                  <div key={`${m.year}-${m.month}`} ref={here ? selected : undefined} className="pt-4">
                    <div className="mb-2 text-center font-semibold">{monthTitle(m)}</div>
                    <div className="grid grid-cols-7 text-center text-xs text-muted">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}
                    </div>
                    {monthGrid(m).map((week, i) => (
                      <div key={i} className="grid grid-cols-7 text-center">
                        {week.map((d, j) =>
                          d ? (
                            <Link
                              prefetch={false}
                              key={d}
                              href={href(d)}
                              transitionTypes={d < day ? BACK : FORWARD}
                              onClick={() => setOpen(false)}
                              className={`mx-auto my-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm ${
                                d === day ? "border-2 border-accent bg-accent/15 font-semibold" : "hover:bg-line"
                              } ${d === today ? "underline underline-offset-4" : ""}`}
                            >
                              {+d.slice(8)}
                            </Link>
                          ) : (
                            <div key={j} />
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
