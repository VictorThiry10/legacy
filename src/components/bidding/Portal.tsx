"use client";
import { createPortal } from "react-dom";

// Full screen layers (the reveal, pop-ups) render at the top of the auction's wrapper, outside the page that
// fades between phases (a parent that is moving would trap them inside itself) and inside the display font.
export default function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.querySelector("[data-auction]") ?? document.body);
}
