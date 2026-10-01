import { ViewTransition } from "react";

// A page that slides in from the right when you go forward and from the left when you go back.
// Links say which way they go with transitionTypes={["nav-forward"]} or {["nav-back"]}; others don't animate.
// Give it a key (e.g. the day) to slide between versions of the same page.
const dir = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

export default function Slide({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={dir} exit={dir} default="none">
      {children}
    </ViewTransition>
  );
}

export const FORWARD = ["nav-forward"];
export const BACK = ["nav-back"];
