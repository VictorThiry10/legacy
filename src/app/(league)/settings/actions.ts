"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/supabase/server";
import { requireCommish } from "@/lib/auth";
import { guard } from "@/lib/guard";
import { SCORING, type Scoring } from "@/lib/rules";
import { releaseContract, signPlayer, trade } from "@/lib/roster";
import { createSchedule, rescoreEverything } from "@/lib/season";
import { isDay } from "@/lib/dates";
import { deliver, emailHtml } from "@/lib/mail";

// Commissioner actions. Each checks the caller is the commissioner, then refreshes every page.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k));
const commish = (fn: () => Promise<string>) =>
  guard(async () => {
    await requireCommish();
    const ok = await fn();
    revalidatePath("/", "layout");
    return ok;
  });

export async function saveSettings(f: FormData) {
  return commish(async () => {
    const league_name = str(f, "league_name");
    const season = num(f, "season");
    const cap = Math.round(num(f, "cap") * 1e6);
    const roster_max = num(f, "roster_max");
    const min_salary = Math.round(num(f, "min_salary") * 1e6);
    const league_size = num(f, "league_size");
    const waiver_hours = num(f, "waiver_hours");
    const { count } = await db().from("teams").select("id", { count: "exact", head: true });
    if (!league_name || league_name.length > 40) throw new Error("League name: 1 to 40 characters.");
    if (!Number.isInteger(season) || season < 2000 || season > 2100) throw new Error("Season start year looks wrong.");
    if (!(cap > 0)) throw new Error("Cap must be more than $0m.");
    if (!Number.isInteger(roster_max) || roster_max < 1 || roster_max > 20) throw new Error("Roster spots: 1 to 20.");
    if (!(min_salary > 0) || min_salary * roster_max > cap) throw new Error("Min salary must be above $0m and fit a full roster under the cap.");
    if (!Number.isInteger(league_size) || league_size < 2 || league_size > 20) throw new Error("League size: 2 to 20 teams.");
    if (league_size < (count ?? 0)) throw new Error(`There are already ${count} teams.`);
    if (!Number.isInteger(waiver_hours) || waiver_hours < 1 || waiver_hours > 168) throw new Error("Waivers: 1 to 168 hours.");
    const { error } = await db().from("settings").update({ league_name, season, cap, roster_max, min_salary, league_size, waiver_hours }).eq("id", 1);
    if (error) throw new Error(error.message);
    return "Settings saved.";
  });
}

export async function saveScoring(f: FormData) {
  return commish(async () => {
    const scoring = {} as Scoring;
    for (const k of Object.keys(SCORING) as (keyof Scoring)[]) {
      const v = num(f, k);
      if (!Number.isFinite(v) || Math.abs(v) > 100) throw new Error(`${k}: enter a number.`);
      scoring[k] = v;
    }
    const { error } = await db().from("settings").update({ scoring }).eq("id", 1);
    if (error) throw new Error(error.message);
    await rescoreEverything();
    return "Scoring saved. Every game and lineup was recounted.";
  });
}

export async function sign(f: FormData) {
  return commish(() =>
    signPlayer({
      teamId: str(f, "team_id"),
      playerId: str(f, "player_id"),
      salary: Math.round(num(f, "salary") * 10) * 100_000, // $0.1m steps
      years: num(f, "years"),
      seasonSigned: num(f, "season_signed") || undefined,
      via: str(f, "via") || "manual",
      note: str(f, "note"),
      override: f.get("override") === "on",
    }),
  );
}

export async function release(f: FormData) {
  return commish(() => releaseContract(str(f, "contract_id"), str(f, "note")));
}

export async function makeTrade(f: FormData) {
  return commish(() =>
    trade({
      teamA: str(f, "team_a"),
      teamB: str(f, "team_b"),
      fromA: f.getAll("from_a").map(String),
      fromB: f.getAll("from_b").map(String),
      note: str(f, "note"),
      override: f.get("override") === "on",
    }),
  );
}

export async function buildSeason(f: FormData) {
  return commish(async () => {
    const first = str(f, "first_day");
    if (!isDay(first)) throw new Error("Pick opening night.");
    return createSchedule(first);
  });
}

// Emails the commissioner a sample trade offer, to check the Gmail setup end to end.
export async function sendTestEmail() {
  return guard(async () => {
    const me = await requireCommish();
    const h = await headers();
    await deliver({
      to: me.manager_email,
      subject: "Trade offer from Brunson Bhenchodes (test)",
      html: emailHtml({
        title: "Brunson Bhenchodes wants to trade",
        lines: ["<b>You get:</b> Jalen Brunson ($24.9m)", "<b>You give:</b> Naz Reid ($14.9m)", "<i>This is a test. Nothing was offered.</i>"],
        button: { label: "Review trade", href: h.get("origin") ?? `https://${h.get("host")}` },
      }),
    });
    return `Sent to ${me.manager_email}.`;
  });
}
