"use client";
import { pushKey, pushOff, pushOn } from "@/app/(league)/push/actions";

// Turning push notifications on and off for this phone or browser. On an iPhone they only exist once Legacy is on
// the home screen, and the permission question can only be asked from a tap.

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function pushSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// The key as bytes: some browsers don't take the text form.
const bytes = (base64url: string) => {
  const b = atob(base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

// Ask for permission, subscribe, tell the server. Returns what went wrong, or null when it's on.
// Call it straight from a tap: the permission question must be the first thing that happens.
export async function turnPushOn(): Promise<string | null> {
  try {
    if ((await Notification.requestPermission()) !== "granted") return "Notifications are blocked for Legacy. Allow them in your phone's settings, then try again.";
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const key = bytes(await pushKey());
    const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await subscribe();
    } else if (sub.options.applicationServerKey && !same(new Uint8Array(sub.options.applicationServerKey), key)) {
      await sub.unsubscribe(); // made with another key: start over
      sub = await subscribe();
    }
    const j = sub.toJSON();
    if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return "This browser gave an incomplete subscription.";
    return (await pushOn({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } })).error ?? null;
  } catch (e) {
    return e instanceof Error ? e.message : "Couldn't turn notifications on.";
  }
}

export async function turnPushOff() {
  const sub = await pushSubscription();
  if (!sub) return;
  await pushOff(sub.endpoint);
  await sub.unsubscribe();
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
