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

const ESPN = "https://a.espncdn.com";

// ESPN resizes its own images on its CDN (the "combiner"): a 36 px avatar doesn't need a 260 KB photo.
const resized = (path: string, w: number, h: number) => `${ESPN}/combiner/i?img=${path}&w=${w}&h=${h}`;

// A player's ESPN headshot, `h` pixels tall (the originals are 600 x 436). h = 0 keeps the original.
// Pick about 3x the size it's drawn at. Addresses that aren't ESPN images pass through.
export const headshot = (url: string | null | undefined, h: number) => {
  if (!url) return null;
  if (!h || !url.startsWith(`${ESPN}/i/`)) return url;
  return resized(url.slice(ESPN.length), Math.round((h * 600) / 436), h);
};

// ESPN's NBA team logo for an abbreviation (BOS, GS, UTAH...), `px` square. px = 0 keeps the 500 px original.
// `dark` is ESPN's version for dark backgrounds (Philadelphia, Toronto and Utah are drawn light there).
export const nbaLogo = (abbr: string | null | undefined, px = 64, dark = false) => {
  if (!abbr) return null;
  const path = `/i/teamlogos/nba/${dark ? "500-dark" : "500"}/${abbr.toLowerCase()}.png`;
  return px ? resized(path, px, px) : ESPN + path;
};
