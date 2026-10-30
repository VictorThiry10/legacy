import Link from "next/link";
import { getMe } from "@/lib/auth";
import { teamSummaries, type TeamSummary } from "@/lib/league";
import { currentOf, matchups, scores, standings, type Matchup, type Standing } from "@/lib/season";
import { movesRow } from "@/lib/roster";
import { headline } from "@/lib/moves";
import { monthDay, today, weekLabel } from "@/lib/dates";
import { winner } from "@/lib/schedule";
import { load } from "@/lib/guard";
import TeamAvatar from "@/components/TeamAvatar";
import PickMenu from "@/components/PickMenu";
import Slide, { FORWARD } from "@/components/Slide";
import PushToggle from "@/components/PushToggle";
import { Dot } from "@/components/PendingRow";
import { head, TeamCell } from "./ui";
import { CONFERENCES, isConference, type Conference } from "@/lib/conferences";

export const dynamic = "force-dynamic";

const VIEWS = [["standings", "Standings"], ["scoreboard", "Scoreboard"], ["playoffs", "Playoffs"], ["intel", "Intel"]] as const;
type View = (typeof VIEWS)[number][0];

// League, ESPN style: a segmented switch between standings, this week's scores, the playoff picture and Intel (the
// cap sheet, the moves log, the rookie draft and the draft picks, each its own page).
export default async function League({ searchParams }: PageProps<"/league">) {
  const [sp, me, teams] = await Promise.all([searchParams, getMe(), teamSummaries()]);
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : "standings";
  const myId = me?.team?.id;
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);

  return (
    <Slide>
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <div className="bg-card px-4 py-3 sm:rounded-t-2xl">
          <div className="grid grid-cols-4 rounded-full bg-line/80 p-1 text-sm">
            {VIEWS.map(([k, label]) => (
              <Link key={k} href={k === "standings" ? "/league" : `/league?view=${k}`} prefetch={true} scroll={false}
                className={`rounded-full py-2 text-center font-medium ${view === k ? "bg-card shadow-sm" : "text-fg/80"}`}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        {view === "standings" && <Standings teams={teams} myId={myId} />}
        {view === "scoreboard" && <Scoreboard team={team} pick={typeof sp.week === "string" ? sp.week : undefined} />}
        {view === "playoffs" && <Playoffs team={team} />}
        {view === "intel" && <Intel myId={myId} />}

        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-card px-4 py-4 text-sm sm:rounded-b-2xl">
          {me?.team?.is_commish && <Link href="/settings" transitionTypes={["nav-forward"]} className="btn-ghost">Commissioner settings</Link>}
          {me?.team && <PushToggle />}
          <form action="/auth/signout" method="post" className="ml-auto">
            <button className="btn-ghost">Sign out</button>
          </form>
        </div>
      </div>
    </Slide>
  );
}

const pct = (r: Standing) => {
  const games = r.w + r.l + r.t;
  if (!games) return ".000";
  const v = (r.w + r.t / 2) / games;
  return v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, "");
};

// By conference when every team has one (the playoffs seed by conference): each ranked on its own, games back
// within it, a line under the two that would go through. One table otherwise. Record, win%, games back, points for
// and against, streak: the team stays put while the numbers scroll sideways on a phone.
async function Standings({ teams, myId }: { teams: TeamSummary[]; myId?: string }) {
  const table = await load(() => standings(teams.map((t) => t.id)));
  if ("err" in table) return <p className="bg-card px-4 py-4 text-sm text-bad">{table.err}</p>;
  const byConference = teams.every((t) => isConference(t.conference));
  const groups = byConference
    ? (Object.keys(CONFERENCES) as Conference[]).map((c) => ({ title: CONFERENCES[c], rows: table.ok.filter((r) => teams.find((t) => t.id === r.teamId)?.conference === c) }))
    : [{ title: "League standings", rows: table.ok }];
  const cols = "grid min-w-[36rem] grid-cols-[minmax(11rem,1fr)_4.5rem_3.5rem_2.5rem_3.5rem_3.5rem_2.75rem] items-center gap-2";
  const streak = (s: string) => (s.startsWith("W") ? "text-good" : s.startsWith("L") ? "text-bad" : "text-muted");
  return (
    <div className="overflow-x-auto bg-card [scrollbar-width:none]">
      {groups.map(({ title, rows }) => {
        const lead = rows[0];
        const gb = (r: Standing) => {
          const g = (lead.w - r.w + (r.l - lead.l)) / 2;
          return g <= 0 ? "-" : String(g);
        };
        return (
          <div key={title}>
            <div className={`${cols} border-y border-line py-2 ${head}`}>
              <span className="sticky left-0 z-10 bg-card pl-4">{title}</span>
              <span className="text-center">Record</span><span className="text-center">Win%</span><span className="text-center">GB</span>
              <span className="text-center">PF</span><span className="text-center">PA</span><span className="pr-4 text-center">Strk</span>
            </div>
            {rows.map((r, i) => {
              const t = teams.find((x) => x.id === r.teamId);
              const line = byConference && i === 1 && rows.length > 2; // the playoff line
              return (
                <div key={r.teamId} className={`${cols} py-3 ${line ? "border-b-2 border-line" : "border-b border-line/60"} ${r.teamId === myId ? "bg-[color-mix(in_srgb,var(--blue)_10%,var(--card))]" : "bg-card"}`}>
                  <span className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-inherit pl-4"><span className="w-4 shrink-0 text-muted">{i + 1}</span><TeamCell t={t} /></span>
                  <span className="text-center num">{r.w}-{r.l}-{r.t}</span>
                  <span className="text-center num">{pct(r)}</span>
                  <span className="text-center num text-muted">{gb(r)}</span>
                  <span className="text-center num text-muted">{Math.round(r.pf)}</span>
                  <span className="text-center num text-muted">{Math.round(r.pa)}</span>
                  <span className={`pr-4 text-center num font-semibold ${streak(r.streak)}`}>{r.streak || "-"}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// One week's matchups. The week label is a menu: every week of the season, past and future, playoffs included.
async function Scoreboard({ team, pick }: { team: (id: string | null) => TeamSummary | undefined; pick?: string }) {
  const r = await load(async () => {
    const all = await matchups();
    const weeks = [...new Set(all.map((m) => m.week))];
    const current = currentOf(all)?.week;
    const chosen = weeks.includes(Number(pick)) ? Number(pick) : current;
    const week = all.filter((m) => m.week === chosen);
    return { all, weeks, current, chosen, week, s: await scores(week.filter((m) => m.home_team_id && m.away_team_id)) };
  });
  if ("err" in r) return <p className="bg-card px-4 py-4 text-sm text-bad">{r.err}</p>;
  const { all, weeks, current, chosen, week, s } = r.ok;
  if (!week.length) return <p className="bg-card px-4 py-6 text-center text-sm text-muted">No matchups scheduled yet.</p>;
  const items = weeks.map((w) => ({
    label: weekLabel(all.find((m) => m.week === w)!),
    href: w === current ? "/league?view=scoreboard" : `/league?view=scoreboard&week=${w}`,
    on: w === chosen,
  }));
  return (
    <div className="bg-card">
      <div className={`border-y border-line px-4 py-2 ${head}`}>
        <PickMenu label={weekLabel(week[0])} items={items} width={300} className="!font-bold uppercase tracking-wide" />
      </div>
      {week.map((m) => <Game key={m.id} m={m} team={team} home={s.get(m.id)?.home ?? 0} away={s.get(m.id)?.away ?? 0} />)}
    </div>
  );
}

function Game({ m, team, home, away }: { m: Matchup; team: (id: string | null) => TeamSummary | undefined; home: number; away: number }) {
  const rows: [string | null, number][] = [[m.away_team_id, away], [m.home_team_id, home]];
  return (
    <Link href={`/matchup?m=${m.id}`} className="block border-b border-line/60 px-4 py-2">
      {rows.map(([id, pts], i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-1">
          <span className="flex min-w-0 items-center gap-3"><TeamAvatar team={team(id)} size="sm" /><span className="truncate font-medium">{team(id)?.name ?? "To be decided"}</span></span>
          <span className="num text-lg font-bold">{pts.toFixed(1)}</span>
        </div>
      ))}
    </Link>
  );
}

// The playoff bracket: the two semifinals on the left, the final on the right, a line joining them. Seeds fill in
// when the regular season is over (season.ts fillPlayoffs); the loser of a finished round goes grey.
async function Playoffs({ team }: { team: (id: string | null) => TeamSummary | undefined }) {
  const r = await load(async () => {
    const all = (await matchups()).filter((m) => m.round !== "regular");
    return { all, s: await scores(all.filter((m) => m.home_team_id && m.away_team_id)), byConference: (await teamSummaries()).every((t) => isConference(t.conference)) };
  });
  if ("err" in r) return <p className="bg-card px-4 py-4 text-sm text-bad">{r.err}</p>;
  const { all, s, byConference } = r.ok;
  const semis = all.filter((m) => m.round === "semi"), final = all.find((m) => m.round === "final");
  if (!semis.length) return <p className="bg-card px-4 py-6 text-center text-sm text-muted">No playoffs yet.</p>;
  // the semifinals seed by conference when the teams have them (Paris, then London), 1 v 4 and 2 v 3 otherwise
  const names = Object.values(CONFERENCES);
  const placeholder = (m: Matchup, i: number) =>
    m.round === "final" ? ["Semifinal 1 winner", "Semifinal 2 winner"]
    : byConference ? [`${names[i]} 2nd seed`, `${names[i]} 1st seed`]
    : i === 0 ? ["4th seed", "1st seed"] : ["3rd seed", "2nd seed"];
  const dates = (m: Matchup) => `${monthDay(m.starts)} to ${monthDay(m.ends)}`;
  const card = (m: Matchup, i: number) => {
    const sc = s.get(m.id);
    const over = !!m.home_team_id && !!m.away_team_id && m.ends < today();
    const won = over && sc ? winner({ home_team_id: m.home_team_id!, away_team_id: m.away_team_id! }, sc.home, sc.away) : null;
    const rows: [string | null, number | undefined, string][] = [[m.away_team_id, sc?.away, placeholder(m, i)[0]], [m.home_team_id, sc?.home, placeholder(m, i)[1]]];
    const inner = rows.map(([id, pts, fallback], k) => (
      <div key={k} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${won && won !== id ? "text-muted" : ""}`}>
        <span className="flex min-w-0 items-center gap-2">{id && <TeamAvatar team={team(id)} size="sm" />}<span className={`truncate ${id ? "font-medium" : "text-muted"}`}>{team(id)?.name ?? fallback}</span></span>
        {id && <span className={`num shrink-0 ${won === id ? "font-bold" : "font-semibold"}`}>{(pts ?? 0).toFixed(1)}</span>}
      </div>
    ));
    const box = "block divide-y divide-line/60 rounded-xl border border-line bg-card";
    return m.home_team_id ? <Link key={m.id} href={`/matchup?m=${m.id}`} className={box}>{inner}</Link> : <div key={m.id} className={box}>{inner}</div>;
  };
  return (
    <div className="bg-card px-4 py-4">
      <div className={`mb-2 grid grid-cols-[1fr_1.5rem_1fr] ${head}`}>
        <span>Semifinals<span className="block font-normal normal-case tracking-normal text-muted">{dates(semis[0])}</span></span>
        <span />
        {final && <span>Final<span className="block font-normal normal-case tracking-normal text-muted">{dates(final)}</span></span>}
      </div>
      <div className="grid grid-cols-[1fr_1.5rem_1fr] items-center">
        <div className="flex flex-col gap-8">{semis.map(card)}</div>
        {/* from the middle of each semifinal to the final */}
        <div className="relative self-stretch"><div className="absolute inset-x-0 bottom-[calc(25%-1rem)] top-[calc(25%-1rem)] rounded-r-lg border-y-2 border-r-2 border-line" /></div>
        <div>{final && card(final, 0)}</div>
      </div>
    </div>
  );
}

// Intel: four pages, each a row that slides in. Recent moves carries the latest one, and a red dot when another
// team has moved since I last looked.
async function Intel({ myId }: { myId?: string }) {
  const mv = myId ? await movesRow(myId).catch(() => null) : null;
  const rows: [string, string, string | null, boolean][] = [
    ["/league/cap", "Cap sheet", null, false],
    ["/league/moves", "Recent moves", mv ? headline(mv.latest) : null, !!mv?.unseen],
    ["/league/draft", "Rookie draft", null, false],
    ["/league/picks", "Draft picks", null, false],
  ];
  return (
    <ul className="divide-y divide-line border-t border-line bg-card">
      {rows.map(([href, label, sub, dot]) => (
        <li key={href}>
          <Link href={href} transitionTypes={FORWARD} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-fg/[0.03] active:bg-fg/[0.06]">
            <span className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-2 text-base font-medium">{label}{dot && <Dot />}</span>
              {sub && <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-muted"><path d="m9 6 6 6-6 6" /></svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
