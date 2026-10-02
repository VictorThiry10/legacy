import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import SubNav from "@/components/SubNav";
import BackBar from "@/components/BackBar";
import Slide from "@/components/Slide";

// Commissioner only (reached from the League page): everyone else goes back to their team.
// The slide sits here, not in the pages: it plays coming in from League and going back, not between the tabs below.
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const me = await getMe();
  if (!me?.team?.is_commish) redirect("/");
  return (
    <Slide>
      <div className="space-y-5">
        <BackBar href="/league" title="Settings" sub="Commissioner only" />
        <SubNav replace tabs={[["/settings", "League"], ["/settings/rosters", "Rosters"], ["/settings/schedule", "Schedule"]]} />
        {children}
      </div>
    </Slide>
  );
}
