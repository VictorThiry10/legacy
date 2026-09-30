import { sendLink } from "./actions";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-2xl font-semibold">Legacy League</h1>
      <p className="text-muted mt-1 text-sm">Sign in with the email the commissioner added for you.</p>
      {sent ? (
        <p className="card mt-6 text-sm">Check your inbox for a sign in link.</p>
      ) : (
        <form action={sendLink} className="mt-6 space-y-3">
          <input name="email" type="email" required placeholder="you@email.com" className="input" />
          <button className="btn w-full">Email me a link</button>
          {error && <p className="text-bad text-sm">{error}</p>}
        </form>
      )}
    </div>
  );
}
