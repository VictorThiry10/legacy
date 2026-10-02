import { nbaLogo } from "@/lib/names";

// An NBA team's logo. In dark mode the phone loads ESPN's dark background version instead. The picture box steps
// aside (contents), so the img sizes and positions like a plain img.
export default function TeamLogo({ abbr, px, alt = "", className }: { abbr: string | null | undefined; px: number; alt?: string; className?: string }) {
  const light = nbaLogo(abbr, px);
  if (!light) return null;
  return (
    <picture className="contents">
      <source media="(prefers-color-scheme: dark)" srcSet={nbaLogo(abbr, px, true)!} />
      <img src={light} alt={alt} className={className} />
    </picture>
  );
}
