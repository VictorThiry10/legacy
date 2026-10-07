import type { CardPlayer } from "@/lib/bidding";
import { headshot, nbaLogo } from "@/lib/names";
import { teamColors } from "@/lib/nba-colors";
import { money } from "@/lib/rules";
import s from "./gold.module.css";

// The auction's player card, Ultimate Team style: a foil by his fantasy points per game (amethyst, black, gold, pale
// gold, silver), his rating, position and NBA team top left, the photo over a glow in his team's colour and a faint
// team crest, his name across the middle and six numbers below. `bid` shows my bid and gives the card a cream rim.
// Sizes itself from its width (container query units), in a grid or full screen.

const INJURY: Record<string, string> = { OUT: "OUT", "DAY-TO-DAY": "DTD", QUESTIONABLE: "Q", DOUBTFUL: "D", SUSPENSION: "SUS" };

// large: the grid and the reveal, with the original photo. thumb: small cards in lists, a resized photo loaded lazily.
export type CardSize = "large" | "thumb";

// The exact images a card draws, so they can be decoded before it's shown (preload.ts). p.headshot stays ESPN's raw address.
export const cardImages = (p: CardPlayer, size: CardSize) => ({
  face: headshot(p.headshot, size === "thumb" ? 160 : 0),
  logo: nbaLogo(p.nbaTeam, 96),
  crest: nbaLogo(p.nbaTeam, size === "thumb" ? 160 : 320),
});

// The foil: fantasy points per game, like Ultimate Team's overall rating. Amethyst 40+, black 35+, gold 30+, pale gold 27+, silver below.
export const tier = (fppg: number | undefined) => (fppg === undefined ? "silver" : fppg >= 40 ? "amethyst" : fppg >= 35 ? "black" : fppg >= 30 ? "gold" : fppg >= 27 ? "pale" : "silver");

export default function PlayerCard({ p, bid, size = "large", className = "", children }: {
  p: CardPlayer; bid?: number; size?: CardSize; className?: string; children?: React.ReactNode;
}) {
  const [first, ...rest] = p.name.split(" ");
  const last = rest.join(" ") || first;
  const pos = (p.position ?? "").split(",").map((x) => x.trim()).filter(Boolean).join("/");
  const { face, logo, crest } = cardImages(p, size);
  const [c1] = teamColors(p.nbaTeam);
  const loading = size === "thumb" ? "lazy" : undefined;
  const injury = p.injury ? (INJURY[p.injury.toUpperCase()] ?? p.injury.slice(0, 3).toUpperCase()) : null;
  const st = p.stats;
  const thumb = size === "thumb";
  const stats = st ? [["PTS", st.ppg], ["REB", st.rpg], ["AST", st.apg], ["STL", st.spg], ["BLK", st.bpg], ["GP", st.gp]] as const : [];
  return (
    <div className={`@container ${s.card} ${s[tier(st?.fppg)]} ${bid !== undefined ? s.bid : ""} ${className}`}>
      <div className={s.body}>
        {/* behind the photo: a glow in the team's colour and the team's crest, faint */}
        <div className="absolute inset-x-0 top-0 h-[60%]" style={{ background: `radial-gradient(60% 70% at 62% 42%, color-mix(in oklab, ${c1} 55%, transparent), transparent 70%)` }} />
        {crest && <img src={crest} alt="" loading={loading} decoding="async" className="pointer-events-none absolute left-[32%] top-[4%] w-[62%] opacity-[0.14] grayscale" />}
        {face && <img src={face} alt="" loading={loading} decoding="async" className="pointer-events-none absolute left-[8%] top-[7cqw] w-full max-w-none" />}
        <div className={s.band} />
        <div className="card-sheen pointer-events-none absolute inset-0" />

        {/* rating, position, team: the top left column */}
        <div className="absolute left-[9cqw] top-[7cqw] flex flex-col items-start leading-none">
          <div className="font-display text-[23cqw] leading-[0.85]">{st ? Math.round(st.fppg) : "–"}</div>
          <div className="mt-[1cqw] text-[5cqw] font-bold tracking-[0.08em]">{pos}</div>
          {logo && <img src={logo} alt="" loading={loading} decoding="async" className="mt-[2.5cqw] w-[13cqw]" />}
          {injury && <div className="mt-[2cqw] rounded-[1cqw] bg-[#b4122d] px-[1.5cqw] py-[0.6cqw] text-[3.4cqw] font-bold tracking-[0.1em] text-white">{injury}</div>}
        </div>
        {bid !== undefined && (
          <div className="font-display absolute right-[7cqw] top-[7cqw] rounded-[1.5cqw] bg-[#0a0a0c] px-[2.5cqw] py-[1cqw] text-[7.5cqw] leading-none text-[#e9c46a]">{money(bid)}</div>
        )}

        {/* name across the middle, then the numbers: two columns, the values lined up on their right */}
        <div className={`absolute inset-x-[8cqw] ${thumb ? "top-[66%]" : "top-[59%]"} text-center`}>
          <div className={`font-display truncate ${thumb ? "text-[14cqw]" : "text-[10.5cqw]"} uppercase leading-[0.9] tracking-[0.04em]`}>{last}</div>
        </div>
        {!thumb && stats.length > 0 && (
          <div className="absolute inset-x-[8cqw] top-[69%] grid grid-cols-2 gap-x-[2cqw] leading-none">
            {stats.map(([label, v]) => (
              <div key={label} className="flex items-baseline gap-[2.2cqw] py-[1.5cqw]">
                <span className="font-display w-[15cqw] text-right text-[9.5cqw]">{label === "GP" ? v : v.toFixed(1)}</span>
                <span className={`${s.dim} text-[4.2cqw] font-bold tracking-[0.1em]`}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ESPN's NBA logo, turned black and gold (the image is grey-scaled and warmed up).
const NBA_LOGO = "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

// Face down: a black foil with the NBA logo in gold, before the card is revealed.
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`@container ${s.card} ${s.black} ${className}`}>
      <div className={s.body}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(70% 55% at 50% 45%, rgba(233,196,106,0.22), transparent 70%)" }} />
        <div className="absolute inset-0 grid place-items-center">
          <img src={NBA_LOGO} alt="" decoding="async" className="w-[38%]" style={{ filter: "grayscale(1) sepia(1) saturate(2.4) brightness(1.05) contrast(1.1)" }} />
        </div>
        <div className="card-sheen pointer-events-none absolute inset-0" />
      </div>
    </div>
  );
}
