"use client";
import { useFormStatus } from "react-dom";

// A form's submit button that dims and shows a spinner the moment it's tapped, until the server answers.
export default function SubmitButton({ children, className = "", disabled }: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={disabled || pending} aria-busy={pending} className={`relative transition-opacity active:opacity-70 disabled:opacity-60 ${className}`}>
      <span className={pending ? "invisible" : ""}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </span>
      )}
    </button>
  );
}
