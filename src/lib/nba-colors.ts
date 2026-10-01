// Each NBA team's main and second colour, by ESPN abbreviation. They paint the bidding site's player cards.
const COLORS: Record<string, [string, string]> = {
  ATL: ["#C8102E", "#FDB927"], BKN: ["#3d3d3d", "#d4d4d4"], BOS: ["#007A33", "#BA9653"], CHA: ["#1D1160", "#00788C"],
  CHI: ["#CE1141", "#1a1a1a"], CLE: ["#860038", "#FDBB30"], DAL: ["#00538C", "#B8C4CA"], DEN: ["#0E2240", "#FEC524"],
  DET: ["#C8102E", "#1D42BA"], GS: ["#1D428A", "#FFC72C"], HOU: ["#CE1141", "#C4CED4"], IND: ["#002D62", "#FDBB30"],
  LAC: ["#C8102E", "#1D428A"], LAL: ["#552583", "#FDB927"], MEM: ["#5D76A9", "#F5B112"], MIA: ["#98002E", "#F9A01B"],
  MIL: ["#00471B", "#EEE1C6"], MIN: ["#0C2340", "#78BE20"], NO: ["#0C2340", "#C8102E"], NY: ["#006BB6", "#F58426"],
  OKC: ["#007AC1", "#EF3B24"], ORL: ["#0077C0", "#C4CED4"], PHI: ["#006BB6", "#ED174C"], PHX: ["#1D1160", "#E56020"],
  POR: ["#E03A3E", "#1a1a1a"], SA: ["#6f7375", "#d4d4d4"], SAC: ["#5A2D81", "#9aa5ab"], TOR: ["#CE1141", "#A1A1A4"],
  UTAH: ["#4B2E83", "#d4d4d4"], WSH: ["#002B5C", "#E31837"],
};

export const teamColors = (abbr?: string | null): [string, string] => COLORS[abbr ?? ""] ?? ["#3f3f46", "#a1a1aa"];
