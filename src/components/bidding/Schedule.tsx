"use client";
import { useState, useTransition } from "react";
import { DAILY, type Schedule as Plan } from "@/lib/rules";
import * as A from "@/app/bidding/actions";
import { useInBrowser, When } from "./time";
import { Label } from "./ui";

// A quick run to try everything: the next round opens in a minute, 2 minutes of bidding, 1 to renounce, a round every 4.
const TEST = { bidMinutes: 2, renounceMinutes: 1, everyMinutes: 4 };

type Row = { label: string; status: string; opens: string | null; closes: string | null; settles: string | null };

// "2026-10-12T08:00" in this browser's time zone, for a datetime-local field.
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
function nextMondayAt8() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  d.setHours(8, 0, 0, 0);
  return d;
}

// The commissioner's schedule (Rounds page): when the next round opens. From there it's a round a day: bidding for
// 10 hours, 2 hours to renounce, signed. Times are typed and shown in the commissioner's own time zone.
export default function Schedule({ schedule, stale, rows }: { schedule: Plan | null; stale: boolean; rows: Row[] }) {
  const inBrowser = useInBrowser();
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const send = (plan: Parameters<typeof A.setSchedule>[0], ask?: string) => {
    if (ask && !window.confirm(ask)) return;
    setErr("");
    start(async () => {
      const r = await A.setSchedule(plan);
      if (r?.error) setErr(r.error);
    });
  };
  const next = rows.find((r) => r.status === "setup");
  const btn = "rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40";

  return (
    <section className="mt-8">
      <Label>Schedule</Label>
      {stale && <p className="mt-2 text-sm text-[var(--bad)]">The schedule&apos;s time has passed, so nothing will open. Set a new one.</p>}
      {schedule && (
        <div className="mt-3 divide-y divide-white/[0.06] rounded-2xl bg-white/[0.025] px-4 text-sm">
          {rows.map((r) => (
            <div key={r.label} className={`py-2.5 ${r.status === "final" ? "opacity-40" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{r.label}</span>
                <span className="text-white/60">
                  {r.status === "open" ? "Live · " : r.status === "final" ? "Done · " : ""}
                  <When iso={r.opens} style="date" />
                </span>
              </div>
              {r.opens && (
                <div className="mt-0.5 text-xs tabular-nums text-white/45">
                  Bids <When iso={r.opens} style="time" /> to <When iso={r.closes} style="time" /> · renounce until <When iso={r.settles} style="time" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The form needs this browser's time zone, so it only appears once the page is in the browser. */}
      {inBrowser && next && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("start") ?? "");
            if (value) send({ start: new Date(value).toISOString(), ...DAILY });
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/[0.06] px-4 ring-1 ring-inset ring-white/10 focus-within:ring-white/30">
            <span className="shrink-0 text-sm text-white/55">{next.label} opens</span>
            <input
              name="start" type="datetime-local" required
              defaultValue={localInput(next.opens && !stale ? new Date(next.opens) : nextMondayAt8())}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none [color-scheme:dark]"
            />
          </label>
          <button disabled={pending} className={`${btn} btn-primary`}>Save</button>
        </form>
      )}
      <p className="mt-2 text-xs text-white/40">
        A round a day from then on: bids for {DAILY.bidMinutes / 60} hours, {DAILY.renounceMinutes / 60} hours to renounce, then the winners sign.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {next && (
          <button
            disabled={pending}
            onClick={() => send({ start: new Date(Date.now() + 60_000).toISOString(), ...TEST }, `Test run? ${next.label} opens in 1 minute: ${TEST.bidMinutes} minutes of bidding, ${TEST.renounceMinutes} to renounce, a round every ${TEST.everyMinutes}.`)}
            className={`${btn} bg-white/[0.06] text-white/70 hover:text-white`}
          >
            Test run
          </button>
        )}
        {schedule && (
          <button disabled={pending} onClick={() => send(null, "Stop the schedule? Nothing opens until you set a new one. A round already open carries on.")} className={`${btn} text-white/55 hover:text-white`}>
            Stop
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-[var(--bad)]">{err}</p>}
    </section>
  );
}
