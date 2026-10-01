import { test } from "node:test";
import assert from "node:assert/strict";
import { headshot, initials, nbaLogo, shortName } from "./names";

test("short names", () => {
  assert.equal(initials("Brunson Bhenchodes"), "BB");
  assert.equal(initials("Fifty Shades of Shai"), "FSOS");
  assert.equal(initials("Thiros"), "THI");
  assert.equal(shortName("Shai Gilgeous-Alexander"), "S. Gilgeous-Alexander");
  assert.equal(shortName("Jaren Jackson Jr."), "J. Jackson Jr.");
  assert.equal(nbaLogo("UTAH", 0), "https://a.espncdn.com/i/teamlogos/nba/500/utah.png");
  assert.equal(nbaLogo("UTAH", 48), "https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/utah.png&w=48&h=48");
  assert.equal(nbaLogo(null), null);
});

test("headshots at the size they're drawn", () => {
  const full = "https://a.espncdn.com/i/headshots/nba/players/full/3945274.png";
  assert.equal(headshot(full, 109), "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/3945274.png&w=150&h=109");
  assert.equal(headshot(full, 0), full);
  assert.equal(headshot("https://example.com/x.png", 100), "https://example.com/x.png");
  assert.equal(headshot(null, 100), null);
});
