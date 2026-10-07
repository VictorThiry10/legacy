import type { CardPlayer } from "@/lib/bidding";
import { headshot, nbaLogo } from "@/lib/names";
import { money } from "@/lib/rules";
import s from "./gold.module.css";

// The bidding site's player card, Ultimate Team style: a foil (gold, silver or bronze by his fantasy points per
// game), his rating, position and NBA team top left, the photo cut out over the foil, his name across the middle
// and six numbers below. `bid` shows my bid and gives the card a cream rim. Sizes itself from its width (container
// query units), in a grid or full screen.

const INJURY: Record<string, string> = { OUT: "OUT", "DAY-TO-DAY": "DTD", QUESTIONABLE: "Q", DOUBTFUL: "D", SUSPENSION: "SUS" };

// large: the grid and the reveal, with the original photo. thumb: small cards in lists, a resized photo loaded lazily.
export type CardSize = "large" | "thumb";

// The exact images a card draws, so they can be decoded before it's shown (preload.ts). p.headshot stays ESPN's raw address.
export const cardImages = (p: CardPlayer, size: CardSize) => ({
  face: headshot(p.headshot, size === "thumb" ? 160 : 0),
  logo: nbaLogo(p.nbaTeam, 96),
});

// The foil: fantasy points per game, like Ultimate Team's overall rating.
export const tier = (fppg: number | undefined) => (fppg === undefined ? "gold" : fppg >= 25 ? "gold" : fppg >= 15 ? "silver" : "bronze");

export default function PlayerCard({ p, bid, size = "large", className = "", children }: {
  p: CardPlayer; bid?: number; size?: CardSize; className?: string; children?: React.ReactNode;
}) {
  const [first, ...rest] = p.name.split(" ");
  const last = rest.join(" ") || first;
  const pos = (p.position ?? "").split(",").map((x) => x.trim()).filter(Boolean).join("/");
  const { face, logo } = cardImages(p, size);
  const loading = size === "thumb" ? "lazy" : undefined;
  const injury = p.injury ? (INJURY[p.injury.toUpperCase()] ?? p.injury.slice(0, 3).toUpperCase()) : null;
  const st = p.stats;
  const thumb = size === "thumb";
  const stats = st ? [["PTS", st.ppg], ["REB", st.rpg], ["AST", st.apg], ["STL", st.spg], ["BLK", st.bpg], ["GP", st.gp]] as const : [];
  return (
    <div className={`@container ${s.card} ${s[tier(st?.fppg)]} ${bid !== undefined ? s.bid : ""} ${className}`}>
      <div className={s.body}>
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
          <div className="font-display absolute right-[7cqw] top-[7cqw] rounded-[1.5cqw] bg-[#0a0a0c] px-[2.5cqw] py-[1cqw] text-[7.5cqw] leading-none text-[var(--gold)]">{money(bid)}</div>
        )}

        {/* name across the middle, then the numbers: two columns, the values lined up on their right */}
        <div className={`absolute inset-x-[8cqw] ${thumb ? "top-[66%]" : "top-[59%]"} text-center`}>
          <div className={`font-display truncate ${thumb ? "text-[14cqw]" : "text-[10.5cqw]"} uppercase leading-[0.9] tracking-[0.04em]`}>{last}</div>
        </div>
        {!thumb && stats.length > 0 && (
          <div className="absolute inset-x-[10cqw] top-[70%] grid grid-cols-2 gap-x-[4cqw] leading-none">
            {stats.map(([label, v]) => (
              <div key={label} className="flex items-baseline gap-[1.6cqw] py-[1.8cqw]">
                <span className="font-display w-[12cqw] text-right text-[7.5cqw]">{label === "GP" ? v : v.toFixed(1)}</span>
                <span className={`${s.dim} text-[3.4cqw] font-bold tracking-[0.12em]`}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// Face down: the foil with the league's name engraved, before the card is revealed.
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`@container ${s.card} ${s.gold} ${className}`}>
      <div className={s.body}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(90% 60% at 30% 10%, rgba(255,250,225,0.35), transparent 70%)" }} />
        <div className="absolute inset-0 grid place-items-center">
          <div className={`font-display ${s.engraved} text-[22cqw] leading-[0.85] tracking-[0.04em]`}>Legacy</div>
        </div>
        <div className="card-sheen pointer-events-none absolute inset-0" />
      </div>
    </div>
  );
}
