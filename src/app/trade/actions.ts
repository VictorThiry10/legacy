"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireTeam } from "@/lib/auth";
import { accept, close, propose } from "@/lib/trades";

const ids = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

// This site's address, for links in emails.
async function site() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

// Send the offer, then back to my team where it shows as sent.
export async function sendOffer(f: FormData) {
  const them = String(f.get("team") ?? "");
  let err = "";
  try {
    const me = await requireTeam();
    await propose({ teamId: me.id, contracts: ids(f, "give") }, { teamId: them, contracts: ids(f, "get") }, await site());
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  if (err) {
    const q = new URLSearchParams([["step", "give"], ...ids(f, "get").map((v) => ["get", v]), ...ids(f, "give").map((v) => ["give", v]), ["err", err]]);
    redirect(`/trade/${encodeURIComponent(them)}?${q}`);
  }
  redirect("/team");
}

async function decide(f: FormData, fn: (offer: string, team: string, site: string) => Promise<void>) {
  let err = "";
  try {
    const me = await requireTeam();
    await fn(String(f.get("offer") ?? ""), me.id, await site());
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  redirect(err ? `/team?err=${encodeURIComponent(err)}` : "/team");
}

export async function acceptOffer(f: FormData) { await decide(f, accept); }
export async function closeOffer(f: FormData) { await decide(f, close); }
