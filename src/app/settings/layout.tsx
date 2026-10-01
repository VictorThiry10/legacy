import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import SubNav from "@/components/SubNav";

// Commissioner only (reached from the League page): everyone else goes back to their team.
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const me = await getMe();
  if (!me?.team?.is_commish) redirect("/");
  return (
    <div className="space-y-5">
      <div>
        <Link href="/league" className="text-xs text-muted hover:text-fg">← League</Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted text-sm">Only the commissioner sees these pages.</p>
      </div>
      <SubNav tabs={[["/settings", "League"], ["/settings/rosters", "Rosters"], ["/settings/schedule", "Schedule"]]} />
      {children}
    </div>
  );
}
