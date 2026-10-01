import Link from "next/link";
import { notFound } from "next/navigation";
import { myTeamOrWelcome } from "@/lib/auth";
import { getSettings } from "@/lib/league";
import { lockedMessage, lockedToday, rosters } from "@/lib/roster";
import { money, yearsLeft } from "@/lib/rules";
import Slide, { BACK } from "@/components/Slide";
import { drop } from "./actions";
import { headshot } from "@/lib/names";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// Confirm dropping one of my players: he goes on waivers and his salary comes off my cap.
export default async function DropPlayer({ params, searchParams }: PageProps<"/players/[id]/drop">) {
  const [{ id }, sp, me, { season, waiverHours }] = await Promise.all([params, searchParams, myTeamOrWelcome(), getSettings()]);
  const p = (await rosters([me.id])).find((r) => r.id === id);
  if (!p) notFound();
  const locked = await lockedToday(p);
  const err = typeof sp.err === "string" ? sp.err : "";
  const left = yearsLeft(p, season);
  return (
    <Slide>
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/players/${p.id}`} transitionTypes={BACK} className="text-sm text-muted hover:text-fg">← {p.name}</Link>
        <div className="card flex items-center gap-4">
          {p.headshot ? <img src={headshot(p.headshot, 192)!} alt="" decoding="async" className="h-16 w-16 rounded-full object-cover bg-line" /> : <span className="h-16 w-16 rounded-full bg-line" />}
          <div>
            <h1 className="text-xl font-semibold">Drop {p.name}</h1>
            <p className="text-sm text-muted">{p.nba_team} · {p.position}</p>
            <p className="text-sm num">{money(p.salary)} · {left} {left === 1 ? "yr" : "yrs"} left</p>
          </div>
        </div>
        {err && <p className="card text-sm text-bad">{err}</p>}
        <div className="card space-y-1 text-sm">
          <p>His {money(p.salary)} comes off your cap and he goes on waivers for {waiverHours} hours.</p>
          <p className="text-muted">The other GMs can send sealed bids on him; you can&apos;t. Nobody bids and he becomes a free agent.</p>
        </div>
        {locked ? (
          <p className="card text-sm">{lockedMessage(p.name)}</p>
        ) : (
          <form action={drop}>
            <input type="hidden" name="player_id" value={p.id} />
            <input type="hidden" name="contract_id" value={p.contract_id} />
            <SubmitButton className="inline-flex w-full items-center justify-center rounded-lg bg-bad px-3 py-2 text-sm font-semibold text-white">Drop {p.name}</SubmitButton>
          </form>
        )}
      </div>
    </Slide>
  );
}
