"use client";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/guard";

// A form that shows the server's error or success message under it.
export default function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(async (_: ActionResult, fd: FormData) => action(fd), undefined);
  return (
    <form
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {state?.error && <p className="text-bad text-xs mt-1 basis-full">{state.error}</p>}
      {state?.ok && <p className="text-good text-xs mt-1 basis-full">{state.ok}</p>}
    </form>
  );
}
