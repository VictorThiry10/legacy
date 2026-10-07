"use client";
import { useState, useTransition } from "react";
import { watch } from "@/app/(league)/players/actions";
import FlagIcon from "./FlagIcon";

// The flag on a player's page: on my watch list or not. It flips at once, and flips back if the save fails.
export default function WatchButton({ playerId, name, watched }: { playerId: string; name: string; watched: boolean }) {
  const [on, setOn] = useState(watched);
  const [, start] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await watch(playerId, next);
      if (r?.error) setOn(!next);
    });
  };
  return (
    <button
      type="button" onClick={flip} aria-pressed={on} title="Watch list"
      aria-label={on ? `Take ${name} off your watch list` : `Add ${name} to your watch list`}
      className={`flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors active:opacity-70 ${on ? "border-blue-fill bg-blue-fill text-white" : "border-blue bg-card text-blue hover:bg-blue/10"}`}
    >
      <FlagIcon on={on} size={17} />
    </button>
  );
}
