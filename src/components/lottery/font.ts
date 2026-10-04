import { Bebas_Neue } from "next/font/google";

// Same display face as the bidding site. Not preloaded: only whoever gets the lottery downloads it.
export const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display", preload: false });
