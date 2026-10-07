// The watch list's flag (a player's page, the Players filter row). Filled when it's on.
export default function FlagIcon({ on = false, size = 18 }: { on?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4.5L18 13H5" fill={on ? "currentColor" : "none"} />
    </svg>
  );
}
