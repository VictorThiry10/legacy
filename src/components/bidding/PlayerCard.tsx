import type { CardPlayer } from "@/lib/bidding";
import { teamColors } from "@/lib/nba-colors";
import { nbaLogo } from "@/lib/names";

// The bidding site's trading card: painted in the player's NBA team colours, headshot, last season per game.
// Sizes itself from its width (container query units), so the same card works in a grid or full screen.

const INJURY: Record<string, string> = { OUT: "OUT", "DAY-TO-DAY": "DTD", QUESTIONABLE: "Q", DOUBTFUL: "D", SUSPENSION: "SUS" };

export default function PlayerCard({ p, className = "", children }: { p: CardPlayer; className?: string; children?: React.ReactNode }) {
  const [c1, c2] = teamColors(p.nbaTeam);
  const [first, ...rest] = p.name.split(" ");
  const last = rest.join(" ") || first;
  const pos = (p.position ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const logo = nbaLogo(p.nbaTeam);
  const injury = p.injury ? (INJURY[p.injury.toUpperCase()] ?? p.injury.slice(0, 3).toUpperCase()) : null;
  return (
    <div
      className={`@container relative aspect-[5/7] overflow-hidden rounded-[7%/5%] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/15 ${className}`}
      style={{ background: `linear-gradient(160deg, ${c1} 0%, color-mix(in srgb, ${c1} 38%, #08080c) 52%, #08080c 100%)` }}
    >
      {logo && <img src={logo} alt="" className="pointer-events-none absolute -right-[22%] -top-[10%] w-[88%] max-w-none rotate-[-12deg] opacity-[0.15]" />}
      <div className="absolute inset-[2.5cqw] rounded-[5cqw] border border-white/10" />
      {p.headshot && (
        <img src={p.headshot} alt="" className="pointer-events-none absolute left-1/2 top-[11%] w-[132%] max-w-none -translate-x-1/2 drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-[62%]" style={{ background: "linear-gradient(to top, #08080c 30%, rgba(8,8,12,0.88) 48%, rgba(8,8,12,0.35) 72%, transparent)" }} />
      <div className="card-sheen pointer-events-none absolute inset-0" />

      <div className="absolute left-[7%] top-[5.5%] leading-none">
        <div className="font-display text-[15cqw] leading-[0.85] drop-shadow">{pos[0] ?? ""}</div>
        {pos.slice(1).map((x) => <div key={x} className="font-display text-[8cqw] leading-none text-white/70">{x}</div>)}
        {injury && <div className="mt-[2cqw] inline-block rounded-[1.5cqw] bg-red-600 px-[2cqw] py-[0.5cqw] text-[5cqw] font-bold">{injury}</div>}
      </div>
      {logo && <img src={logo} alt="" className="absolute right-[6%] top-[5%] w-[17%] drop-shadow" />}

      <div className="absolute inset-x-[7%] bottom-[5.5%]">
        <div className="truncate text-[5.5cqw] font-semibold uppercase tracking-[0.25em] text-white/65">{rest.length ? first : ""}</div>
        <div className="font-display truncate text-[15cqw] uppercase leading-[0.9]">{last}</div>
        <div className="mt-[2.5cqw] h-[0.6cqw] rounded-full" style={{ background: `linear-gradient(90deg, ${c2}, transparent 85%)` }} />
        {p.stats ? (
          <div className="mt-[2.5cqw] grid grid-cols-4 gap-[1cqw] text-center">
            <Stat label="FPTS" v={p.stats.fppg} gold />
            <Stat label="PTS" v={p.stats.ppg} />
            <Stat label="REB" v={p.stats.rpg} />
            <Stat label="AST" v={p.stats.apg} />
          </div>
        ) : (
          <div className="mt-[2.5cqw] text-[5cqw] uppercase tracking-widest text-white/40">No stats last season</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, v, gold }: { label: string; v: number; gold?: boolean }) {
  return (
    <div className="leading-none">
      <div className={`font-display text-[9.5cqw] ${gold ? "gold-text" : ""}`}>{v.toFixed(1)}</div>
      <div className="mt-[0.8cqw] text-[4cqw] font-semibold tracking-[0.15em] text-white/45">{label}</div>
    </div>
  );
}

// Face down: what a card looks like before it's revealed.
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div
      className={`@container relative aspect-[5/7] overflow-hidden rounded-[7%/5%] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/15 ${className}`}
      style={{ background: "radial-gradient(130% 90% at 50% 0%, #3a0c18 0%, #12070c 45%, #08080c 100%)" }}
    >
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(245,196,81,0.07) 0 1px, transparent 1px 9px)" }} />
      <div className="absolute inset-[2.5cqw] rounded-[5cqw] border border-[#f5c451]/30" />
      <div className="absolute inset-[5cqw] rounded-[3.5cqw] border border-[#f5c451]/10" />
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display gold-text text-[36cqw] leading-[0.8]">LL</div>
          <div className="mt-[3cqw] text-[4.5cqw] font-semibold tracking-[0.45em] text-white/45">LEGACY LEAGUE</div>
        </div>
      </div>
      <div className="card-sheen pointer-events-none absolute inset-0" />
    </div>
  );
}
