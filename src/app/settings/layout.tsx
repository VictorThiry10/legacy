import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import SubNav from "@/components/SubNav";

// Commissioner only: everyone else goes back to Home.
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const me = await getMe();
  if (!me?.team?.is_commish) redirect("/");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted text-sm">Only the commissioner sees these pages.</p>
      </div>
      <SubNav tabs={[["/settings", "League"], ["/settings/rosters", "Rosters"], ["/settings/schedule", "Schedule"]]} />
      {children}
    </div>
  );
}
