// The rookie draft's players. Eight have a set price; any other NBA rookie can be picked at the minimum salary.
export type Rookie = { id: string; name: string; position: string; nba: string; salary: number }; // id: ESPN's

const M = 1_000_000;
export const ROOKIES: Rookie[] = [
  { id: "5142718", name: "AJ Dybantsa", position: "SF", nba: "WSH", salary: 5 * M },
  { id: "5041935", name: "Cameron Boozer", position: "PF", nba: "MEM", salary: 4 * M },
  { id: "5041955", name: "Darryn Peterson", position: "PG, SG", nba: "UTAH", salary: 3 * M },
  { id: "5095151", name: "Caleb Wilson", position: "SF", nba: "CHI", salary: 3 * M },
  { id: "5142620", name: "Darius Acuff Jr.", position: "PG", nba: "SAC", salary: 3 * M },
  { id: "5254165", name: "Keaton Wagler", position: "PG, SG", nba: "LAC", salary: 2 * M },
  { id: "5101761", name: "Mikel Brown Jr.", position: "PG", nba: "BKN", salary: 2 * M },
  { id: "5149077", name: "Kingston Flemings", position: "PG, SG", nba: "ATL", salary: 2 * M },
];

// Contracts are 1 to 4 years.
export const LENGTHS = [1, 2, 3, 4];


