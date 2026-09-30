import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";
import { getMe } from "@/lib/league";

export const metadata: Metadata = { title: "Legacy League", description: "Our dynasty basketball league" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const me = await getMe().catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen">
        {me?.team && (
          <header className="border-b border-line bg-card">
            <nav className="mx-auto max-w-7xl flex items-center gap-4 px-4 py-3 text-sm overflow-x-auto">
              <span className="font-semibold whitespace-nowrap">Legacy</span>
              <Nav />
              <span className="ml-auto text-muted whitespace-nowrap hidden sm:inline">{me.team?.name ?? me.email}</span>
              <form action="/auth/signout" method="post" className="ml-auto sm:ml-0">
                <button className="text-muted hover:text-fg">Sign out</button>
              </form>
            </nav>
          </header>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
