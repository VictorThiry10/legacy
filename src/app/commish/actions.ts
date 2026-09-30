"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/server";
import { getSettings, log, requireCommish, resolve, type Round } from "@/lib/league";
import { syncPlayers, syncDay, syncSchedule } from "@/lib/espn";
import { guard } from "@/lib/guard";
import { money } from "@/lib/rules";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => revalidatePath("/", "layout");

async function getRound(id: string) {
  const { data } = await db().from("rounds").select("*").eq("id", id).single();
  if (!data) throw new Error("Round not found.");
  return data as Round;
}

// ---------- teams ----------
export async function addTeam(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const { error } = await db().from("teams").insert({
      name: str(f, "name"),
      manager_name: str(f, "manager_name") || null,
      manager_email: str(f, "manager_email").toLowerCase(),
      is_commish: f.get("is_commish") === "on",
    });
    if (error) throw new Error(error.code === "23505" ? "That email is already on a team." : error.message);
    done();
    return "Team added. They can now sign in with that email.";
  });
}

export async function updateTeam(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const { error } = await db().from("teams").update({
      name: str(f, "name"),
      manager_name: str(f, "manager_name") || null,
      manager_email: str(f, "manager_email").toLowerCase(),
    }).eq("id", str(f, "id"));
    if (error) throw new Error(error.message);
    done();
    return "Saved.";
  });
}

export async function removeTeam(f: FormData) {
  return guard(async () => {
    const me = await requireCommish();
    if (str(f, "id") === me.id) throw new Error("You can't remove your own team.");
    await db().from("teams").delete().eq("id", str(f, "id"));
    done();
  });
}

// ---------- settings ----------
export async function saveSettings(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const { error } = await db().from("settings").update({
      league_name: str(f, "league_name"),
      season: Number(str(f, "season")),
      cap: Math.round(Number(str(f, "cap")) * 1e6),
      roster_max: Number(str(f, "roster_max")),
      min_salary: Math.round(Number(str(f, "min_salary")) * 1e6),
    }).eq("id", 1);
    if (error) throw new Error(error.message);
    done();
    return "Settings saved.";
  });
}

// ---------- players ----------
export async function loadPlayers() {
  return guard(async () => {
    await requireCommish();
    const n = await syncPlayers();
    done();
    return `Loaded ${n} players from ESPN.`;
  });
}

export async function loadSchedule() {
  return guard(async () => {
    await requireCommish();
    const { season } = await getSettings();
    const n = await syncSchedule(new Date(`${season}-10-15T00:00:00Z`), new Date(`${season + 1}-04-20T00:00:00Z`));
    done();
    return `Loaded ${n} games.`;
  });
}

export async function loadBoxScores(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const date = str(f, "date").replace(/-/g, "");
    const r = await syncDay(date, true);
    done();
    return `${r.games} games, ${r.lines} player lines saved.`;
  });
}

// ---------- rounds ----------
export async function newRound(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const { season } = await getSettings();
    const { data: last } = await db().from("rounds").select("number").eq("season", season).order("number", { ascending: false }).limit(1).maybeSingle();
    const number = (last?.number ?? 0) + 1;
    const { data: round, error } = await db().from("rounds").insert({ season, number }).select().single();
    if (error) throw new Error(error.message);
    if (f.get("from_unsold") === "on") {
      // 13th round: every player offered this season who nobody won
      const { data: offered } = await db().from("round_players").select("player_id, round:rounds!inner(season)").eq("round.season", season);
      const { data: owned } = await db().from("contracts").select("player_id").eq("active", true);
      const taken = new Set((owned ?? []).map((o) => o.player_id));
      const ids = [...new Set((offered ?? []).map((o) => o.player_id))].filter((id) => !taken.has(id));
      if (ids.length) await db().from("round_players").insert(ids.map((player_id) => ({ round_id: round.id, player_id })));
    }
    done();
    return `Round ${number} created. Add players, then open it.`;
  });
}

export async function addToRound(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const round = await getRound(str(f, "round_id"));
    if (round.status !== "setup") throw new Error("Players can only be added before the round opens.");
    const { data: owned } = await db().from("contracts").select("id").eq("player_id", str(f, "player_id")).eq("active", true).maybeSingle();
    if (owned) throw new Error("That player is already on a team.");
    const { error } = await db().from("round_players").insert({ round_id: round.id, player_id: str(f, "player_id") });
    if (error && error.code !== "23505") throw new Error(error.message);
    done();
  });
}

export async function removeFromRound(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const round = await getRound(str(f, "round_id"));
    if (round.status !== "setup") throw new Error("The round is already open.");
    await db().from("round_players").delete().eq("round_id", round.id).eq("player_id", str(f, "player_id"));
    done();
  });
}

export async function openRoundNow(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const round = await getRound(str(f, "round_id"));
    if (round.status !== "setup") throw new Error("Round already opened.");
    const minutes = Math.max(1, Number(str(f, "minutes")) || 5);
    const closes_at = new Date(Date.now() + minutes * 60_000).toISOString();
    await db().from("rounds").update({ status: "open", closes_at }).eq("id", round.id);
    await log("round", `Round ${round.number} opened for ${minutes} minutes`);
    done();
    return `Round ${round.number} is open.`;
  });
}

export async function reveal(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const round = await getRound(str(f, "round_id"));
    if (round.status !== "open") throw new Error("Round is not open.");
    await db().from("rounds").update({ status: "revealed", closes_at: new Date().toISOString() }).eq("id", round.id);
    await log("round", `Round ${round.number} results revealed`);
    done();
    return "Results revealed. Finalize once renounces are done.";
  });
}

export async function finalize(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const round = await getRound(str(f, "round_id"));
    if (round.status !== "revealed") throw new Error("Reveal the round first.");
    const { result } = await resolve(round);
    const tie = result.awards.find((a) => a.tie);
    if (tie && f.get("ties_ok") !== "on") throw new Error("A tie needs rock paper scissors. Settle it, fix the bids if needed, then tick the box to confirm.");
    if (result.awards.length) {
      const { error } = await db().from("contracts").insert(
        result.awards.map((a) => ({
          player_id: a.playerId, team_id: a.teamId, salary: a.amount, years: a.years,
          season_signed: round.season, acquired_via: "draft",
        })),
      );
      if (error) throw new Error(error.message);
    }
    await db().from("rounds").update({ status: "final" }).eq("id", round.id);
    await log("round", `Round ${round.number} final: ${result.awards.length} signed, ${result.unsold.length} unsold`);
    done();
    return `Round ${round.number} final. ${result.awards.length} players signed.`;
  });
}

export async function deleteRound(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const round = await getRound(str(f, "round_id"));
    if (round.status === "final") throw new Error("Final rounds can't be deleted. Release contracts instead.");
    await db().from("rounds").delete().eq("id", round.id);
    done();
  });
}

// ---------- contracts & cap ----------
export async function addContract(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const { season } = await getSettings();
    const salary = Math.round(Number(str(f, "salary")) * 1e6);
    const { error } = await db().from("contracts").insert({
      player_id: str(f, "player_id"), team_id: str(f, "team_id"), salary, years: Number(str(f, "years")),
      season_signed: season, acquired_via: str(f, "via") || "manual",
    });
    if (error) throw new Error(error.code === "23505" ? "That player is already on a team." : error.message);
    done();
    return `Added at ${money(salary)}.`;
  });
}

export async function releaseContract(f: FormData) {
  return guard(async () => {
    await requireCommish();
    await db().from("contracts").update({ active: false }).eq("id", str(f, "id"));
    done();
  });
}

export async function addAdjustment(f: FormData) {
  return guard(async () => {
    await requireCommish();
    const extra = Number(str(f, "extra"));
    await db().from("cap_adjustments").insert({ team_id: str(f, "team_id"), amount: -Math.round(extra * 1e6), reason: str(f, "reason") });
    done();
    return "Cap adjustment added.";
  });
}

export async function endAdjustment(f: FormData) {
  return guard(async () => {
    await requireCommish();
    await db().from("cap_adjustments").update({ active: false }).eq("id", str(f, "id"));
    done();
  });
}
