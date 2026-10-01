// Month grids for the date picker. Pure functions on "YYYY-MM-DD" strings.

export type Month = { year: number; month: number }; // month 1-12
const pad = (n: number) => String(n).padStart(2, "0");

// Every month from the one holding `from` to the one holding `to`.
export function monthsBetween(from: string, to: string): Month[] {
  const out: Month[] = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  const end = +to.slice(0, 4) * 12 + +to.slice(5, 7);
  while (y * 12 + m <= end) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Weeks (Sunday first) of a month; null pads the first and last week.
export function monthGrid({ year, month }: Month): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const monthTitle = ({ year, month }: Month) =>
  new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
