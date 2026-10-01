"use client";
import { createPortal } from "react-dom";

// Full screen layers (reveal, pop-ups) render at the top of the bidding site, outside the animated page wrapper:
// a parent that is moving would otherwise trap them inside itself.
export default function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.querySelector(".bidding") ?? document.body);
}
