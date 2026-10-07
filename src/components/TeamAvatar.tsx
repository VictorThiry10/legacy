import { initials } from "@/lib/names";
import { teamColor, type Look } from "@/lib/team-look";

const BOX = { sm: "h-7 w-7 text-[9px]", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm", xl: "h-24 w-24 text-2xl" };

// A fantasy team's badge: its photo if it has one (ringed in its colour, if it picked one), otherwise its initials
// on its colour. `team` carries the look; `name` alone gives the initials on a colour picked from the name.
export default function TeamAvatar({ team, name, size = "md" }: { team?: Look | null; name?: string | null; size?: keyof typeof BOX }) {
  const t: Look | null = team ?? (name ? { name } : null);
  const box = `${BOX[size]} inline-flex shrink-0 items-center justify-center rounded-full`;
  if (t?.logo_url) {
    const ring = t.color ? { boxShadow: `0 0 0 ${size === "sm" ? 1.5 : 2}px ${t.color}` } : undefined;
    return <img src={t.logo_url} alt="" className={`${box} bg-line object-cover`} style={ring} />;
  }
  return (
    <span className={`${box} font-bold text-white`} style={{ background: t ? teamColor(t) : "var(--line)" }}>
      {t ? initials(t.name) : "?"}
    </span>
  );
}
