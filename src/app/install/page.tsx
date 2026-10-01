import Link from "next/link";

export const metadata = { title: "Install Legacy" };

// Open to everyone (no sign in needed) so the commissioner can text this link around.
export default function Install() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-4">
        <img src="/apple-icon.png" alt="" className="h-16 w-16 rounded-2xl" />
        <div>
          <h1 className="text-2xl font-semibold">Get the Legacy app</h1>
          <p className="text-sm text-muted">Takes 10 seconds. No App Store needed.</p>
        </div>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">iPhone</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>Open this page in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button (square with an arrow).</li>
          <li>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Android</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>Open this page in <b>Chrome</b>.</li>
          <li>Tap the <b>⋮</b> menu, top right.</li>
          <li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
        </ol>
      </section>

      <p className="text-sm text-muted">
        Then open Legacy from your home screen and sign in once. <Link href="/" className="text-accent hover:underline">Go to Legacy</Link>
      </p>
    </div>
  );
}
