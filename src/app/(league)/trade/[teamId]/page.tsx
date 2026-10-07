import Link from "next/link";
import { notFound } from "next/navigation";
import { myTeamOrWelcome } from "@/lib/auth";
import { getSettings, teamSummaries } from "@/lib/league";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { preview } from "@/lib/trades";
import { picksOf, type Pick } from "@/lib/picks";
import { money, yearsLeft } from "@/lib/rules";
import { load } from "@/lib/guard";
import Slide, { BACK } from "@/components/Slide";
import { sendOffer } from "../actions";
import { headshot } from "@/lib/names";
import SubmitButton from "@/components/SubmitButton";
import BackBar from "@/components/BackBar";
import StepForm from "@/components/StepForm";
import TradeSheet, { PickIcon } from "@/components/TradeSheet";
import type { Look } from "@/lib/team-look";
import ScrollLock from "@/components/ScrollLock";

export const dynamic = "force-dynamic";

// Trade in three steps: pick their players and draft picks, pick mine, then confirm in a summary pop-up.
// Selections travel in the address (?get=...&give=... for players, ?getp=...&givep=... for picks). Each step takes the previous one's place in history, so the
// back arrow walks back through the steps and the phone's back gesture leaves the trade.
export default async function Trade({ params, searchParams }: PageProps<"/trade/[teamId]">) {
  const [{ teamId }, sp, me, teams, { season }] = await Promise.all([params, searchParams, myTeamOrWelcome(), teamSummaries(), getSettings()]);
  const them = teams.find((t) => t.id === teamId);
  const mine = teams.find((t) => t.id === me.id)!;
  if (!them || them.id === me.id) notFound();
  const list = (k: string) => [sp[k]].flat().filter((v): v is string => typeof v === "string" && !!v);
  const get = list("get"), give = list("give"), getp = list("getp"), givep = list("givep");
  const step = sp.step === "give" || sp.step === "review" ? sp.step : "get";
  const err = typeof sp.err === "string" ? sp.err : "";
  const [theirs, ours, picks] = await Promise.all([rosters([them.id]), rosters([me.id]), picksOf([them.id, me.id])]);
  const review = step === "review" ? await load(() => preview({ teamId: me.id, contracts: give, picks: givep }, { teamId: them.id, contracts: get, picks: getp })) : null;

  const first = step === "get";
  const roster = first ? theirs : ours;
  const field = first ? "get" : "give";
  const chosen = first ? get : give;
  const sidePicks = picks.filter((x) => x.team_id === (first ? them.id : me.id));
  const chosenPicks = first ? getp : givep;
  const all: [string, string[]][] = [["get", get], ["give", give], ["getp", getp], ["givep", givep]];
  const url = (s: string | null) => `/trade/${them.id}?${new URLSearchParams([...(s ? [["step", s]] : []), ...all.flatMap(([k, ids]) => ids.map((v) => [k, v]))])}`;

  return (
    <Slide key={first ? "get" : "give"}>
      <div className="pb-28">
        {first ? (
          <BackBar href={`/teams/${them.id}`} title={`Trade with ${them.name}`} sub={`What you get · ${money(them.capSpace)} cap space`} right={<Steps n={1} />} />
        ) : (
          <BackBar href={url(null)} step title="What you give" sub={`${mine.name} · ${money(mine.capSpace)} cap space`} right={<Steps n={2} />} />
        )}
        {err && <p className="-mx-4 bg-bad/10 px-4 py-2 text-sm text-bad sm:mx-0">{err}</p>}

        <StepForm action={`/trade/${them.id}`}>
          <input type="hidden" name="step" value={first ? "give" : "review"} />
          {/* the other step's choices ride along */}
          {all.filter(([k]) => (first ? k.startsWith("give") : k.startsWith("get"))).flatMap(([k, ids]) => ids.map((v) => <input key={k + v} type="hidden" name={k} value={v} />))}
          <ul className="-mx-4 bg-card sm:mx-0 sm:mt-3 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line">
            {roster.map((p) => <PlayerPick key={p.contract_id} p={p} season={season} name={field} checked={chosen.includes(p.contract_id)} />)}
            {!roster.length && <li className="px-4 py-6 text-center text-sm text-muted">No players.</li>}
          </ul>
          {!!sidePicks.length && (
            <>
              <h2 className="px-0 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Draft picks</h2>
              <ul className="-mx-4 bg-card sm:mx-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line">
                {sidePicks.map((x) => <PickPick key={x.id} pick={x} name={`${field}p`} checked={chosenPicks.includes(x.id)} />)}
              </ul>
            </>
          )}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <button className="mx-auto block w-full max-w-md rounded-full bg-blue-fill py-3.5 text-base font-semibold text-white transition-opacity group-data-[pending]:opacity-60">
              {first ? "Continue" : "Review trade"}
            </button>
          </div>
        </StepForm>

        {step === "review" && review && (
          <Summary
            review={review}
            them={{ id: them.id, name: them.name, logo_url: them.logo_url, color: them.color, space: them.capSpace }}
            me={{ name: mine.name, logo_url: mine.logo_url, color: mine.color, space: mine.capSpace }}
            fields={all}
            closeHref={url("give")}
          />
        )}
      </div>
    </Slide>
  );
}

// "1 of 2" in the bar.
function Steps({ n }: { n: number }) {
  return <span className="shrink-0 rounded-full bg-fg/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted">{n} of 2</span>;
}

// One roster row with the blue add box (a styled checkbox, so several can be picked).
function PlayerPick({ p, season, name, checked }: { p: RosterPlayer; season: number; name: string; checked: boolean }) {
  return (
    <li className="border-b border-line/60 last:border-b-0">
      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
        <input type="checkbox" name={name} value={p.contract_id} defaultChecked={checked} className="peer sr-only" />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-blue text-lg font-bold leading-none text-blue transition-colors peer-checked:bg-blue-fill peer-checked:text-white peer-checked:[&>.plus]:hidden peer-checked:[&>.tick]:inline peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
          <span className="plus">+</span>
          <span className="tick hidden text-base">✓</span>
        </span>
        {p.headshot ? <img src={headshot(p.headshot, 110)!} alt="" loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-full bg-line object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-full bg-line" />}
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

// One draft pick with the same blue add box as a player.
function PickPick({ pick, name, checked }: { pick: Pick; name: string; checked: boolean }) {
  return (
    <li className="border-b border-line/60 last:border-b-0">
      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
        <input type="checkbox" name={name} value={pick.id} defaultChecked={checked} className="peer sr-only" />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-blue text-lg font-bold leading-none text-blue transition-colors peer-checked:bg-blue-fill peer-checked:text-white peer-checked:[&>.plus]:hidden peer-checked:[&>.tick]:inline peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
          <span className="plus">+</span>
          <span className="tick hidden text-base">✓</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg/[0.06] text-muted"><PickIcon /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-medium">{pick.year} rookie pick</span>
          <span className="block truncate text-[11px] text-muted">{pick.original.name}</span>
        </span>
      </label>
    </li>
  );
}

type Review = { ok: Awaited<ReturnType<typeof preview>> } | { err: string };

function Summary({ review, them, me, fields, closeHref }: {
  review: Review;
  them: Look & { id: string; space: number }; me: Look & { space: number };
  fields: [string, string[]][]; closeHref: string;
}) {
  if ("err" in review) {
    return (
      <Modal closeHref={closeHref}>
        <p className="p-5 text-sm text-bad">{review.err}</p>
      </Modal>
    );
  }
  const { get: inn, give: out, getPicks, givePicks, problems } = review.ok;
  return (
    <Modal closeHref={closeHref}>
      <TradeSheet me={me} them={them} get={inn} give={out} getPicks={getPicks} givePicks={givePicks} />
      <div className="space-y-3 border-t border-line p-4">
        {!!problems.length && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{problems.join("; ")}</p>}
        <form action={sendOffer} className="flex gap-2">
          <input type="hidden" name="team" value={them.id} />
          {fields.flatMap(([k, ids]) => ids.map((v) => <input key={k + v} type="hidden" name={k} value={v} />))}
          <Link href={closeHref} replace transitionTypes={BACK} className="flex-1 rounded-full border-[1.5px] border-line py-3 text-center font-semibold">Back</Link>
          <SubmitButton disabled={!!problems.length} className="flex-1 rounded-full bg-blue-fill py-3 font-semibold text-white">Send offer</SubmitButton>
        </form>
      </div>
    </Modal>
  );
}

// A pop-up over a dimmed page, rising into place. Tapping outside goes back a step.
function Modal({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <ScrollLock />
      <Link href={closeHref} replace transitionTypes={BACK} className="menu-dim absolute inset-0 bg-black/50" aria-label="Close" />
      <div data-scrolls className="menu-pop menu-pop-up relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-card shadow-2xl">{children}</div>
    </div>
  );
}
