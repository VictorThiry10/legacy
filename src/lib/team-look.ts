// A team's look (its badge): a photo, a colour, or neither (then the colour comes from its name).
export type Look = { name: string; logo_url?: string | null; color?: string | null };

// The colours a GM can pick. All dark enough for white initials, and none so dark it vanishes in dark mode.
export const TEAM_COLORS = [
  "#be123c", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#0284c7",
  "#2563eb", "#4f46e5", "#9333ea", "#db2777", "#78716c", "#475569", "#3f3f46",
];

// The colour behind a team's initials: its own, or one picked from its name.
export function teamColor(t: Look) {
  if (t.color) return t.color;
  const hue = [...t.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return `hsl(${hue} 55% 42%)`;
}

export const LOGO_BUCKET = "team-logos";
export const LOGO_PX = 320; // the photo is cut to a square this wide before it's sent
