// Short forms of names, for tight spaces. Pure.

// Fantasy team: "Brunson Bhenchodes" -> BB, one-word names -> first 3 letters.
export const initials = (name: string) => {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 4) : name.slice(0, 3)).toUpperCase();
};

// Player: "Shai Gilgeous-Alexander" -> "S. Gilgeous-Alexander"
export const shortName = (name: string) => {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : name;
};

// ESPN's NBA team logo for an abbreviation (BOS, GS, UTAH...).
export const nbaLogo = (abbr: string | null | undefined) =>
  abbr ? `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png` : null;
