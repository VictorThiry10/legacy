import { cookies } from "next/headers";
import { sendCode, startOver, verifyCode } from "./actions";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const email = (await cookies()).get("login_email")?.value;
  const codeStep = sp.step === "code" && !!email;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-2xl font-semibold">Legacy League</h1>
      {codeStep ? (
        <>
          <p className="text-muted mt-1 text-sm">We emailed a 6-digit code to <b className="text-fg">{email}</b>. Type it below. It can take a minute, and might land in spam.</p>
          <form action={verifyCode} className="mt-6 space-y-3">
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="6-digit code" maxLength={10} className="input text-center text-lg tracking-widest" autoFocus />
            <button className="btn w-full">Sign in</button>
            {error && <p className="text-bad text-sm">{error}</p>}
          </form>
          <form action={startOver} className="mt-4 text-center">
            <button className="text-xs text-muted hover:text-fg">Use a different email or send a new code</button>
          </form>
        </>
      ) : (
        <>
          <p className="text-muted mt-1 text-sm">Enter your email and we&apos;ll send you a code.</p>
          <form action={sendCode} className="mt-6 space-y-3">
            <input name="email" type="email" required placeholder="you@email.com" className="input" autoFocus />
            <button className="btn w-full">Email me a code</button>
            {error && <p className="text-bad text-sm">{error}</p>}
          </form>
        </>
      )}
    </div>
  );
}
