"use client";
import { useActionState } from "react";
import { signIn } from "@/app/(league)/bidding/actions";

// Email only, for a GM who isn't signed in to the league app: the email linked to their team and they're in.
export default function Login() {
  const [state, run, pending] = useActionState(signIn, undefined);
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <div className="card space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Auction</h1>
          <p className="mt-1 text-sm text-muted">Sign in with the email linked to your team.</p>
        </div>
        <form action={run} className="space-y-3">
          <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="Your email" className="input" />
          <button disabled={pending} className="btn w-full rounded-full py-3">{pending ? "Signing in…" : "Sign in"}</button>
          {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        </form>
      </div>
    </div>
  );
}
