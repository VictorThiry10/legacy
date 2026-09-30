"use client";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";

// Finishes a sign in from an email link: the session is in the part of the link after the #.
export default function Confirm() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    const fail = (msg: string) => setTimeout(() => setError(msg), 0);
    if (!access_token || !refresh_token) {
      fail(p.get("error_code") === "otp_expired" ? "That link has expired or was already used." : "That link didn't work.");
      return;
    }
    const supa = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!);
    supa.auth.setSession({ access_token, refresh_token }).then(({ error: e }) => {
      if (e) fail("That link didn't work.");
      else window.location.replace("/");
    });
  }, []);
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-2xl font-semibold">Legacy League</h1>
      {error ? (
        <p className="mt-4 text-sm"><span className="text-bad">{error}</span> <Link href="/login" className="underline">Get a new one</Link></p>
      ) : (
        <p className="text-muted mt-4 text-sm">Signing you in…</p>
      )}
    </div>
  );
}
