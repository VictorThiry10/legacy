"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { sawConferences } from "@/app/(league)/conferences/actions";
import type { ConferenceReveal } from "@/lib/conference-reveal";

// Loaded on its own and only in the browser: the show (motion) stays out of the league pages.
const Reveal = dynamic(() => import("./Reveal"), { ssr: false });

// The conferences reveal pop-up: opens over the league app once per GM (lib/conference-reveal.ts). Closing it
// tells the server, then refreshes the page under it.
export default function ConferencesPopup({ data }: { data: ConferenceReveal }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  if (!open) return null;
  return (
    <Reveal
      data={data}
      onClose={() => {
        setOpen(false);
        sawConferences().catch(() => null).then(() => router.refresh());
      }}
    />
  );
}
