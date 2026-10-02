"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FORWARD } from "./Slide";

// A form whose answers go in the address of the next step of a flow (the trade builder). The next step slides in and
// takes this step's place in history, so the back arrow walks back through the steps and history keeps one entry
// for the whole flow. Without JavaScript it's a plain GET form. The page can style the pending state with group-data.
export default function StepForm({ action, className, children }: { action: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      method="get"
      action={action}
      className={`group ${className ?? ""}`}
      data-pending={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        const q = new URLSearchParams([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)]));
        start(() => router.replace(`${action}?${q}`, { transitionTypes: FORWARD }));
      }}
    >
      {children}
    </form>
  );
}
