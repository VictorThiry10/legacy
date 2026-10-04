"use server";
import { requireTeam } from "@/lib/auth";
import { notifyEndpoint, pushPublicKey, removeSubscription, saveSubscription, type Subscription } from "@/lib/push";

// What a phone needs to subscribe to our pushes.
export async function pushKey() {
  await requireTeam();
  return pushPublicKey();
}

// This phone turned notifications on: remember it for the GM's team and send a first push to prove it works.
export async function pushOn(sub: Subscription): Promise<{ error?: string }> {
  try {
    const me = await requireTeam();
    await saveSubscription(me.id, sub);
    const sent = await notifyEndpoint(sub.endpoint, { title: "Notifications are on", body: "Trades and injury news will show up here.", url: "/team", tag: "push-on" });
    return sent ? {} : { error: "Saved, but the test notification didn't go through. Try again in a minute." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function pushOff(endpoint: string) {
  await requireTeam();
  await removeSubscription(endpoint);
}
