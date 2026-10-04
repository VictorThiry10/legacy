import "server-only";
import webpush from "web-push";
import { db, commissionerEmail } from "./supabase/server";

// Push notifications to the phones that turned them on (PushPrompt, the service worker in public/sw.js).
// Like email, a push is a nice-to-have: nothing here ever throws into the action that triggered it.

export type PushMessage = {
  title: string; body: string;
  url: string;  // the page a tap opens
  tag?: string; // a newer message with the same tag replaces the older one on the lock screen
};

// The app's signing keys for the push services. Made once, the first time they're needed, and kept in app_secrets.
async function keys(): Promise<{ publicKey: string; privateKey: string }> {
  const read = async (again = false) => {
    const q = db().from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
    const { data } = await (again ? q.order("key") : q); // asked differently: an identical request is answered from memory
    const get = (k: string) => data?.find((r) => r.key === k)?.value;
    return { publicKey: get("vapid_public"), privateKey: get("vapid_private") };
  };
  let k = await read();
  if (!k.publicKey || !k.privateKey) {
    const made = webpush.generateVAPIDKeys();
    // if two requests race, the first insert wins and both read the same pair back
    await db().from("app_secrets").upsert(
      [{ key: "vapid_public", value: made.publicKey }, { key: "vapid_private", value: made.privateKey }],
      { onConflict: "key", ignoreDuplicates: true },
    );
    k = await read(true);
  }
  if (!k.publicKey || !k.privateKey) throw new Error("Push keys are missing.");
  return { publicKey: k.publicKey, privateKey: k.privateKey };
}

// What a phone needs to subscribe.
export const pushPublicKey = async () => (await keys()).publicKey;

export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function saveSubscription(teamId: string, s: Subscription) {
  if (!/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw new Error("That isn't a push subscription.");
  const { error } = await db().from("push_subscriptions").upsert({ endpoint: s.endpoint, team_id: teamId, p256dh: s.keys.p256dh, auth: s.keys.auth });
  if (error) throw new Error(error.message);
}

export async function removeSubscription(endpoint: string) {
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint);
}

type Row = { endpoint: string; p256dh: string; auth: string };

// Send one message to every device of these teams. A device that has gone (app removed, permission withdrawn) is
// forgotten. Returns how many were delivered to the push services.
export async function notifyTeams(teamIds: string[], message: PushMessage): Promise<number> {
  if (!teamIds.length) return 0;
  const { data } = await db().from("push_subscriptions").select("endpoint, p256dh, auth").in("team_id", [...new Set(teamIds)]);
  return send(data ?? [], message);
}

// The same, to one device (the first push after turning notifications on).
export async function notifyEndpoint(endpoint: string, message: PushMessage): Promise<number> {
  const { data } = await db().from("push_subscriptions").select("endpoint, p256dh, auth").eq("endpoint", endpoint);
  return send(data ?? [], message);
}

async function send(subs: Row[], message: PushMessage): Promise<number> {
  try {
    if (!subs.length) return 0;
    const k = await keys();
    const options = { TTL: 24 * 3600, vapidDetails: { subject: `mailto:${commissionerEmail()}`, publicKey: k.publicKey, privateKey: k.privateKey } };
    const body = JSON.stringify(message);
    const sent = await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
        return 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await removeSubscription(s.endpoint);
        else console.error("push failed", status, e instanceof Error ? e.message : e);
        return 0;
      }
    }));
    return sent.reduce<number>((a, n) => a + n, 0);
  } catch (e) {
    console.error("push failed", e);
    return 0;
  }
}
