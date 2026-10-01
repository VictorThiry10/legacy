import "server-only";
import { commissionerEmail, db } from "./supabase/server";
import { emailHtml, sendMail } from "./mail";
import { lastRuns } from "./espn";
import { ago } from "./dates";

// Scores update at least every 10 minutes. Older than this means something stopped.
export const STALE_MINUTES = 45;

// Emails the commissioner when scores stopped updating: once per outage (not again until scores have updated
// since). Called every 30 minutes by its own timer, and by the scores job itself (so the daily Vercel backup run
// still raises it if the Supabase timers stopped).
export async function checkScoresFresh() {
  const runs = await lastRuns();
  const last = runs.scores ?? new Date(0).toISOString();
  const minutes = Math.round((Date.now() - Date.parse(last)) / 60_000);
  if (minutes < STALE_MINUTES) return { fresh: true, minutes };
  if (runs["stale-alert"] && Date.parse(runs["stale-alert"]) > Date.parse(last)) return { fresh: false, minutes, emailed: "already" };
  await db().from("sync_log").upsert({ name: "stale-alert", last_run: new Date().toISOString() });
  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://legacy-topaz-nine.vercel.app";
  const emailed = await sendMail({
    to: commissionerEmail(),
    subject: "Legacy League: scores stopped updating",
    html: emailHtml({
      title: "Scores stopped updating",
      lines: [
        `The last update was ${ago(last)}.`,
        "Nothing is lost: when updates resume, every missed day of the last week is caught up.",
        "If this keeps happening, check the timers in Supabase and the logs in Vercel.",
      ],
      button: { label: "Open the league", href: site },
    }),
  });
  return { fresh: false, minutes, emailed };
}
