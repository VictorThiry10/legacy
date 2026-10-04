"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

// Loaded on its own and only in the browser: the show (drum, motion, random odds) stays out of the league pages.
const Lottery = dynamic(() => import("./Lottery"), { ssr: false });

// The rookie lottery pop-up: opens over the league app each time the app loads, until closed.
export default function LotteryPopup() {
  const [open, setOpen] = useState(true);
  return open ? <Lottery onClose={() => setOpen(false)} /> : null;
}
