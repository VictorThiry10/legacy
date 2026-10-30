import "server-only";
import { commissionerEmail, db } from "./supabase/server";
import { emailHtml, sendMail } from "./mail";
import { gamesOnNow, lastRuns } from "./espn";
import { ago } from "./dates";

// While games are on, scores update every 2 minutes. Older than this means something stopped: the timer, the site,
// or ESPN's feed (sync_log.scores is the last success, not the last try). With no game on there is nothing to
// update, so nothing is stale.
export const STALE_MINUTES = 45;

// Emails the commissioner when scores stopped updating: once per outage (not again until scores have updated
// since). Called every 30 minutes by its own timer, and by the scores job itself (so the daily Vercel backup run
// still raises it if the Supabase timers stopped).
export async function checkScoresFresh() {
  const [runs, live] = await Promise.all([lastRuns(), gamesOnNow()]);
  const last = runs.scores ?? new Date(0).toISOString();
  const minutes = Math.round((Date.now() - Date.parse(last)) / 60_000);
  if (!live) return { fresh: true, minutes, quiet: "no games on" };
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
