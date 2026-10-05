"use client";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { LotteryTeam } from "@/lib/lottery";

const Lottery = dynamic(() => import("./Lottery"), { ssr: false });

// A button that opens the rookie lottery again (League page): Play shows the saved draw, the same one as ever.
// On <body>: the page slides, which would trap it.
export default function LotteryButton({ field, className, children }: { field: LotteryTeam[]; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      {open &&
        createPortal(
          <Lottery
            field={field}
            onClose={() => {
              setOpen(false);
              router.refresh();
            }}
          />,
          document.body,
        )}
    </>
  );
}
