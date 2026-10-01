import type { CardPlayer } from "@/lib/bidding";
import { teamColors } from "@/lib/nba-colors";
import { headshot, nbaLogo } from "@/lib/names";
import { money } from "@/lib/rules";

// The bidding site's player card: dark, a soft glow in the NBA team's colour, headshot, fantasy points per game.
// `bid` shows my bid in gold. Sizes itself from its width (container query units), in a grid or full screen.

const INJURY: Record<string, string> = { OUT: "OUT", "DAY-TO-DAY": "DTD", QUESTIONABLE: "Q", DOUBTFUL: "D", SUSPENSION: "SUS" };

// large: the grid and the reveal, with the original photo. thumb: small cards in lists, a resized photo loaded lazily.
export type CardSize = "large" | "thumb";

// The exact images a card draws, so they can be decoded before it's shown (preload.ts). p.headshot stays ESPN's raw address.
export const cardImages = (p: CardPlayer, size: CardSize) => ({
  face: headshot(p.headshot, size === "thumb" ? 160 : 0),
  logo: nbaLogo(p.nbaTeam, 96),
});

export default function PlayerCard({ p, bid, size = "large", className = "", children }: {
  p: CardPlayer; bid?: number; size?: CardSize; className?: string; children?: React.ReactNode;
}) {
  const [c1] = teamColors(p.nbaTeam);
  const [first, ...rest] = p.name.split(" ");
  const last = rest.join(" ") || first;
  const pos = (p.position ?? "").split(",").map((s) => s.trim()).filter(Boolean).join(" / ");
  const { face, logo } = cardImages(p, size);
  const loading = size === "thumb" ? "lazy" : undefined;
  const injury = p.injury ? (INJURY[p.injury.toUpperCase()] ?? p.injury.slice(0, 3).toUpperCase()) : null;
  return (
    <div className={`@container relative aspect-[5/7] overflow-hidden rounded-[7%/5%] bg-[#121215] ring-1 ring-inset ring-white/10 ${className}`}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 70% at 50% 0%, color-mix(in oklab, ${c1} 42%, transparent) 0%, transparent 72%)` }} />
      {face && (
        <img src={face} alt="" loading={loading} decoding="async" className="pointer-events-none absolute left-1/2 top-[10%] w-[126%] max-w-none -translate-x-1/2" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-[60%]" style={{ background: "linear-gradient(to top, #121215 46%, rgba(18,18,21,0.85) 62%, transparent)" }} />
      <div className="card-sheen pointer-events-none absolute inset-0" />

      <div className="absolute left-[7%] top-[6%] text-[5cqw] font-semibold tracking-[0.18em] text-white/70">
        {pos}
        {injury && <span className="ml-[2cqw] text-red-400">{injury}</span>}
      </div>
      {logo && <img src={logo} alt="" loading={loading} decoding="async" className="absolute right-[6%] top-[4.5%] w-[13%] opacity-90" />}

      <div className="absolute inset-x-[7%] bottom-[6%]">
        <div className="truncate text-[5cqw] font-medium uppercase tracking-[0.22em] text-white/45">{rest.length ? first : ""}</div>
        <div className="font-display truncate text-[14cqw] uppercase leading-[0.92]">{last}</div>
        <div className="mt-[3cqw] flex items-baseline justify-between gap-[2cqw] border-t border-white/10 pt-[3cqw] leading-none">
          <span className="whitespace-nowrap">
            <span className="font-display text-[9cqw]">{p.stats ? p.stats.fppg.toFixed(1) : "–"}</span>
            <span className="ml-[1.5cqw] text-[4cqw] font-semibold tracking-[0.18em] text-white/40">FPTS</span>
          </span>
          {bid !== undefined && <span className="font-display text-[9cqw] text-[var(--gold)]">{money(bid)}</span>}
        </div>
      </div>
      {bid !== undefined && <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-[var(--gold)]/70" />}
      {children}
    </div>
  );
}

// Face down: what a card looks like before it's revealed.
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`@container relative aspect-[5/7] overflow-hidden rounded-[7%/5%] bg-[#121215] ring-1 ring-inset ring-white/10 ${className}`}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(110% 65% at 50% 0%, rgba(255,255,255,0.08), transparent 70%)" }} />
      <div className="absolute inset-[4cqw] rounded-[5cqw] border border-white/[0.06]" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="font-display silver-text text-[30cqw] leading-none">LL</div>
      </div>
      <div className="card-sheen pointer-events-none absolute inset-0" />
    </div>
  );
}
