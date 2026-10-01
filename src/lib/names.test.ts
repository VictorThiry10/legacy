import { test } from "node:test";
import assert from "node:assert/strict";
import { initials, nbaLogo, shortName } from "./names";

test("short names", () => {
  assert.equal(initials("Brunson Bhenchodes"), "BB");
  assert.equal(initials("Fifty Shades of Shai"), "FSOS");
  assert.equal(initials("Thiros"), "THI");
  assert.equal(shortName("Shai Gilgeous-Alexander"), "S. Gilgeous-Alexander");
  assert.equal(shortName("Jaren Jackson Jr."), "J. Jackson Jr.");
  assert.equal(nbaLogo("UTAH"), "https://a.espncdn.com/i/teamlogos/nba/500/utah.png");
});
