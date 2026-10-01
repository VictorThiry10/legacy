import Link from "next/link";
import { notFound } from "next/navigation";
import { myTeamOrWelcome } from "@/lib/auth";
import { getSettings, teamSummaries } from "@/lib/league";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { preview } from "@/lib/trades";
import { money, yearsLeft } from "@/lib/rules";
import { load } from "@/lib/guard";
import Slide, { BACK } from "@/components/Slide";
import { sendOffer } from "../actions";

export const dynamic = "force-dynamic";

// Trade in three steps: pick their players, pick mine, then confirm in a summary pop-up.
// Selections travel in the address (?get=...&give=...), so each step is a page you can go back to.
export default async function Trade({ params, searchParams }: PageProps<"/trade/[teamId]">) {
  const [{ teamId }, sp, me, teams, { season }] = await Promise.all([params, searchParams, myTeamOrWelcome(), teamSummaries(), getSettings()]);
  const them = teams.find((t) => t.id === teamId);
  const mine = teams.find((t) => t.id === me.id)!;
  if (!them || them.id === me.id) notFound();
  const list = (k: string) => [sp[k]].flat().filter((v): v is string => typeof v === "string" && !!v);
  const get = list("get"), give = list("give");
  const step = sp.step === "give" || sp.step === "review" ? sp.step : "get";
  const err = typeof sp.err === "string" ? sp.err : "";
  const [theirs, ours] = await Promise.all([rosters([them.id]), rosters([me.id])]);
  const review = step === "review" ? await load(() => preview({ teamId: me.id, contracts: give }, { teamId: them.id, contracts: get })) : null;

  const roster = step === "get" ? theirs : ours;
  const field = step === "get" ? "get" : "give";
  const chosen = step === "get" ? get : give;
  const back = step === "get" ? `/players` : `/trade/${them.id}?${new URLSearchParams(get.map((g) => ["get", g]))}`;

  return (
    <Slide key={step}>
      <div className="-mx-4 -mt-6 pb-28 sm:mx-0 sm:mt-0">
        <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3">
          <Link href={back} transitionTypes={BACK} className="text-xl text-muted hover:text-fg" aria-label="Back">‹</Link>
          <div className="min-w-0">
            <div className="truncate font-semibold">{step === "get" ? `Trade with ${them.name}` : "Pick your players"}</div>
            <div className="text-xs text-muted">{step === "get" ? `${them.manager_name ?? ""} · ${money(them.capSpace)} cap space` : `${mine.name} · ${money(mine.capSpace)} cap space`}</div>
          </div>
        </div>
        {err && <p className="bg-bad/10 px-4 py-2 text-sm text-bad">{err}</p>}

        <form method="get" action={`/trade/${them.id}`}>
          <input type="hidden" name="step" value={step === "get" ? "give" : "review"} />
          {step !== "get" && get.map((g) => <input key={g} type="hidden" name="get" value={g} />)}
          <ul className="bg-card">
            {roster.map((p) => <PlayerPick key={p.contract_id} p={p} season={season} name={field} checked={chosen.includes(p.contract_id)} />)}
            {!roster.length && <li className="px-4 py-6 text-center text-sm text-muted">No players.</li>}
          </ul>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <button className="mx-auto block w-full max-w-md rounded-full bg-blue py-3.5 text-base font-semibold text-white">Continue</button>
          </div>
        </form>

        {step === "review" && review && (
          <Summary
            review={review}
            them={{ id: them.id, name: them.name, space: them.capSpace }}
            me={{ name: mine.name, space: mine.capSpace }}
            get={get}
            give={give}
            closeHref={`/trade/${them.id}?${new URLSearchParams([["step", "give"], ...get.map((g) => ["get", g]), ...give.map((g) => ["give", g])])}`}
          />
        )}
      </div>
    </Slide>
  );
}

// One roster row with the blue add box (a styled checkbox, so several can be picked).
function PlayerPick({ p, season, name, checked }: { p: RosterPlayer; season: number; name: string; checked: boolean }) {
  return (
    <li className="border-b border-line/60">
      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
        <input type="checkbox" name={name} value={p.contract_id} defaultChecked={checked} className="peer sr-only" />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-blue text-lg font-bold leading-none text-blue peer-checked:bg-blue peer-checked:text-white peer-checked:[&>.plus]:hidden peer-checked:[&>.tick]:inline peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
          <span className="plus">+</span>
          <span className="tick hidden text-base">✓</span>
        </span>
        {p.headshot ? <img src={p.headshot} alt="" className="h-9 w-9 shrink-0 rounded-full bg-line object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-full bg-line" />}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-medium">{p.name}</span>
          <span className="block truncate text-[11px] text-muted">
            {p.nba_team} · {p.position}{p.injury_status && <span className="text-bad"> · {p.injury_status}</span>}
          </span>
        </span>
        <span className="text-right leading-tight">
          <span className="block num text-sm font-semibold">{money(p.salary)}</span>
          <span className="block text-[11px] text-muted">{yearsLeft(p, season)}yr left · ends {String(p.season_signed + p.years - 1).slice(2)}–{String(p.season_signed + p.years).slice(2)}</span>
        </span>
      </label>
    </li>
  );
}

type Review = { ok: Awaited<ReturnType<typeof preview>> } | { err: string };

function Summary({ review, them, me, get, give, closeHref }: {
  review: Review;
  them: { id: string; name: string; space: number }; me: { name: string; space: number };
  get: string[]; give: string[]; closeHref: string;
}) {
  if ("err" in review) {
    return (
      <Modal closeHref={closeHref}>
        <p className="text-sm text-bad">{review.err}</p>
      </Modal>
    );
  }
  const { get: inn, give: out, problems } = review.ok;
  const sum = (ps: RosterPlayer[]) => ps.reduce((a, p) => a + p.salary, 0);
  const net = sum(inn) - sum(out);
  return (
    <Modal closeHref={closeHref}>
      <h2 className="text-lg font-bold">Trade with {them.name}</h2>
      <table className="w-full text-sm">
        <tbody>
          <tr><td colSpan={2} className="pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">You get</td></tr>
          {inn.map((p) => <tr key={p.contract_id}><td className="py-0.5">{p.name}</td><td className="py-0.5 text-right num">{money(p.salary)}</td></tr>)}
          {!inn.length && <tr><td className="py-0.5 text-muted">Nobody</td><td /></tr>}
          <tr><td colSpan={2} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">You give</td></tr>
          {out.map((p) => <tr key={p.contract_id}><td className="py-0.5">{p.name}</td><td className="py-0.5 text-right num">{money(p.salary)}</td></tr>)}
          {!out.length && <tr><td className="py-0.5 text-muted">Nobody</td><td /></tr>}
          <tr><td className="pt-3 text-muted">Your salary change</td><td className="pt-3 text-right num font-semibold">{net >= 0 ? "+" : "−"}{money(Math.abs(net))}</td></tr>
          <tr><td className="text-muted">Your cap space after</td><td className="text-right num">{money(me.space - net)}</td></tr>
          <tr><td className="text-muted">{them.name} cap space after</td><td className="text-right num">{money(them.space + net)}</td></tr>
        </tbody>
      </table>
      {!!problems.length && <p className="text-sm text-bad">{problems.join("; ")}</p>}
      <form action={sendOffer} className="flex gap-2 pt-1">
        <input type="hidden" name="team" value={them.id} />
        {get.map((g) => <input key={g} type="hidden" name="get" value={g} />)}
        {give.map((g) => <input key={g} type="hidden" name="give" value={g} />)}
        <Link href={closeHref} transitionTypes={BACK} className="flex-1 rounded-full border border-line py-3 text-center font-semibold">Back</Link>
        <button disabled={!!problems.length} className="flex-1 rounded-full bg-blue py-3 font-semibold text-white disabled:opacity-40">Confirm</button>
      </form>
      <p className="text-center text-xs text-muted">{them.name} gets the offer to accept or decline.</p>
    </Modal>
  );
}

// A centred pop-up over a dimmed page. Tapping outside goes back a step.
function Modal({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Link href={closeHref} transitionTypes={BACK} className="absolute inset-0 bg-black/50" aria-label="Close" />
      <div className="relative w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-2xl">{children}</div>
    </div>
  );
}

