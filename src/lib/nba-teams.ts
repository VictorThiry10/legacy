// The 30 NBA teams by ESPN abbreviation. Pure.
export const NBA_TEAMS: Record<string, string> = {
  ATL: "Atlanta Hawks", BKN: "Brooklyn Nets", BOS: "Boston Celtics", CHA: "Charlotte Hornets", CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers", DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons", GS: "Golden State Warriors",
  HOU: "Houston Rockets", IND: "Indiana Pacers", LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", NO: "New Orleans Pelicans", NY: "New York Knicks",
  OKC: "Oklahoma City Thunder", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns", POR: "Portland Trail Blazers",
  SA: "San Antonio Spurs", SAC: "Sacramento Kings", TOR: "Toronto Raptors", UTAH: "Utah Jazz", WSH: "Washington Wizards",
};

// "Clippers", "Trail Blazers": the name without the city. Unknown abbreviations come back as they are.
export const nickname = (abbr: string) => {
  const name = NBA_TEAMS[abbr.toUpperCase()];
  if (!name) return abbr;
  return name.endsWith("Trail Blazers") ? "Trail Blazers" : name.split(" ").pop()!;
};
