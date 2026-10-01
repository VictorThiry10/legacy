import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import "./globals.css";
import { getMe } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Legacy League",
  description: "Our dynasty basketball league",
  applicationName: "Legacy",
  // Opens full screen (no Safari bar) when launched from the home screen.
  appleWebApp: { capable: true, title: "Legacy", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1c1917" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const me = await getMe().catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen">
        {me?.team && (
          <header className="sticky top-0 z-20 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
            <div className="mx-auto max-w-7xl flex items-center gap-4 px-4 pt-2 text-sm">
              <span className="font-semibold whitespace-nowrap">Legacy</span>
              <span className="ml-auto text-muted truncate">{me.team.name}</span>
              {me.team.is_commish && <Link href="/settings" className="text-muted hover:text-fg whitespace-nowrap">Settings</Link>}
              <form action="/auth/signout" method="post">
                <button className="text-muted hover:text-fg whitespace-nowrap">Sign out</button>
              </form>
            </div>
            <Nav />
          </header>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
