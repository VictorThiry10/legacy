import type { Metadata, Viewport } from "next";
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
          <header className="sticky top-0 z-30 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.12)]" style={{ viewTransitionName: "site-header" }}>
            <Nav />
          </header>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
