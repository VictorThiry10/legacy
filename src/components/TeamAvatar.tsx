import { initials } from "@/lib/names";

// A fantasy team's badge: initials on a colour picked from its name.
export default function TeamAvatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const hue = [...(name ?? "?")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const box = { sm: "h-7 w-7 text-[9px]", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white`} style={{ background: name ? `hsl(${hue} 55% 42%)` : "var(--line)" }}>
      {name ? initials(name) : "?"}
    </span>
  );
}
