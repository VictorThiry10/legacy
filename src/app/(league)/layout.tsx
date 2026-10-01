import Nav from "@/components/Nav";
import { getMe } from "@/lib/auth";

// The league app: tab bar on top once you have a team.
export default async function LeagueLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  return (
    <>
      {me?.team && (
        <header className="sticky top-0 z-30 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.12)]" style={{ viewTransitionName: "site-header" }}>
          <Nav />
        </header>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
