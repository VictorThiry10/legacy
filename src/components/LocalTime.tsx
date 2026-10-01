import { cookies } from "next/headers";
import ClientTime from "./ClientTime";

const FORMATS = {
  time: { hour: "numeric", minute: "2-digit" },
  day: { weekday: "short", month: "short", day: "numeric" },
  date: { month: "short", day: "numeric", year: "numeric" },
} as const;

// A time in the viewer's own time zone. The phone tells us its zone in a cookie (TimeZone in the league layout),
// so the time is in the page from the first paint and nothing shifts. First visit without the cookie: the phone fills it in.
export default async function LocalTime({ iso, mode = "time" }: { iso: string; mode?: keyof typeof FORMATS }) {
  const text = format(iso, mode, (await cookies()).get("tz")?.value);
  return text ? <span>{text}</span> : <ClientTime iso={iso} mode={mode} />;
}

function format(iso: string, mode: keyof typeof FORMATS, tz?: string) {
  if (!tz) return null;
  try {
    return new Date(iso).toLocaleString("en-US", { ...FORMATS[mode], timeZone: decodeURIComponent(tz) });
  } catch {
    return null; // unknown zone name
  }
}
