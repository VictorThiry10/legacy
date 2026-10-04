"use server";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { headers } from "next/headers";
import { requireTeam } from "@/lib/auth";
import { accept, close, propose } from "@/lib/trades";

const ids = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

// This site's address, for links in emails.
async function site() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

// Send the offer, then back to my team where it shows as sent. The redirects replace the trade builder in history,
// so going back from the team page doesn't reopen a trade that has already gone.
export async function sendOffer(f: FormData) {
  const them = String(f.get("team") ?? "");
  let err = "";
  try {
    const me = await requireTeam();
    await propose({ teamId: me.id, contracts: ids(f, "give"), picks: ids(f, "givep") }, { teamId: them, contracts: ids(f, "get"), picks: ids(f, "getp") }, await site());
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  if (err) {
    const q = new URLSearchParams([["step", "give"], ...["get", "give", "getp", "givep"].flatMap((k) => ids(f, k).map((v) => [k, v])), ["err", err]]);
    redirect(`/trade/${encodeURIComponent(them)}?${q}`, RedirectType.replace);
  }
  redirect("/team", RedirectType.replace);
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
  redirect(err ? `/team?err=${encodeURIComponent(err)}` : "/team", RedirectType.replace);
}

export async function acceptOffer(f: FormData) { await decide(f, accept); }
export async function closeOffer(f: FormData) { await decide(f, close); }
