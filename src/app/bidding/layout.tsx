import type { Metadata, Viewport } from "next";
import { Bebas_Neue } from "next/font/google";

// The bidding site: its own dark look, no league tabs. Shares the database (teams, cap, contracts) with the league app.
const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Free Agency · Legacy League",
  appleWebApp: { capable: true, title: "Free Agency", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#07070b", viewportFit: "cover" };

export default function BiddingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`bidding ${display.variable} relative min-h-dvh overflow-x-clip text-white`}>
      <div aria-hidden className="bid-bg pointer-events-none fixed inset-0" />
      <div className="relative">{children}</div>
    </div>
  );
}
