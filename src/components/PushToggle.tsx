"use client";
import { useEffect, useState } from "react";
import { pushSubscription, pushSupported, turnPushOff, turnPushOn } from "./push-client";
import { BellIcon } from "./PushPrompt";

// The League page's switch for this phone's notifications. Not shown where they can't work (a browser without
// push, or an iPhone where Legacy isn't on the home screen yet).
export default function PushToggle() {
  const [state, setState] = useState<"none" | "off" | "on" | "blocked">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return;
    const blocked = Notification.permission === "denied";
    (blocked ? Promise.resolve(null) : pushSubscription())
      .then((sub) => setState(blocked ? "blocked" : sub && Notification.permission === "granted" ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  if (state === "none") return null;
  const flip = async () => {
    setBusy(true);
    setError(null);
    if (state === "on") {
      await turnPushOff().catch(() => {});
      setState("off");
    } else {
      const problem = await turnPushOn();
      if (problem) setError(problem);
      else setState("on");
    }
    setBusy(false);
  };
  return (
    <span className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={flip} disabled={busy || state === "blocked"} aria-pressed={state === "on"} className="btn-ghost shrink-0 gap-1.5 whitespace-nowrap disabled:opacity-60">
        <BellIcon />
        {state === "on" ? "Notifications on" : state === "blocked" ? "Notifications blocked" : "Notifications off"}
      </button>
      {(error || state === "blocked") && <span className="min-w-0 text-xs text-muted">{error ?? "Allow them for Legacy in your phone's settings."}</span>}
    </span>
  );
}
