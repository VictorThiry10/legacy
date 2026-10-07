import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";

// The auction lives inside the league app (its theme, its tabs, its back bar). Only the cards and the reveal use
// the display face, so it's loaded here rather than for the whole app. Full screen layers (the reveal, pop-ups)
// are rendered into this wrapper (Portal.tsx), so they get the face too.
const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = { title: "Auction · Legacy League" };

export default function AuctionLayout({ children }: { children: React.ReactNode }) {
  return <div data-auction className={display.variable}>{children}</div>;
}
