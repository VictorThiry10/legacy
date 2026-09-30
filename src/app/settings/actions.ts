"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/server";
import { requireCommish } from "@/lib/league";
import { guard } from "@/lib/guard";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveSettings(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const league_name = str(f, "league_name");
    const season = Number(str(f, "season"));
    const cap = Math.round(Number(str(f, "cap")) * 1e6);
    const roster_max = Number(str(f, "roster_max"));
    const min_salary = Math.round(Number(str(f, "min_salary")) * 1e6);
    if (!league_name || league_name.length > 40) throw new Error("League name: 1 to 40 characters.");
    if (!Number.isInteger(season) || season < 2000 || season > 2100) throw new Error("Season start year looks wrong.");
    if (!(cap > 0)) throw new Error("Cap must be more than $0m.");
    if (!Number.isInteger(roster_max) || roster_max < 1 || roster_max > 20) throw new Error("Roster spots: 1 to 20.");
    if (!(min_salary > 0) || min_salary * roster_max > cap) throw new Error("Min salary must be above $0m and fit a full roster under the cap.");
    const { error } = await db().from("settings").update({ league_name, season, cap, roster_max, min_salary }).eq("id", 1);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return "Settings saved.";
  });
}
