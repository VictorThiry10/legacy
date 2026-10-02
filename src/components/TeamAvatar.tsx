import { initials } from "@/lib/names";

// A team's own colour, picked from its name (the same every time). `alpha` for tints.
export function teamColor(name: string, alpha = 1) {
  const hue = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return `hsl(${hue} 55% 42% / ${alpha})`;
}

// A fantasy team's badge: initials on its colour.
export default function TeamAvatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "h-7 w-7 text-[9px]", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white`} style={{ background: name ? teamColor(name) : "var(--line)" }}>
      {name ? initials(name) : "?"}
    </span>
  );
}
