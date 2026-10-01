import Link from "next/link";
import { getMe } from "@/lib/auth";
import { getSettings, teamSummaries, type TeamSummary } from "@/lib/league";
import { currentOf, matchups, scores, standings, type Matchup, type Standing } from "@/lib/season";
import { money } from "@/lib/rules";
import { recentMoves } from "@/lib/roster";
import { weekLabel } from "@/lib/dates";
import { load } from "@/lib/guard";
import Moves from "@/components/Moves";
import TeamAvatar from "@/components/TeamAvatar";

export const dynamic = "force-dynamic";

const VIEWS = [["standings", "Standings"], ["scoreboard", "Scoreboard"], ["playoffs", "Playoffs"], ["cap", "Cap"]] as const;
type View = (typeof VIEWS)[number][0];

// League, ESPN style: a segmented switch between standings, this week's scores, the playoff picture and the cap sheet.
export default async function League({ searchParams }: PageProps<"/league">) {
  const [sp, me, { rules }, teams] = await Promise.all([searchParams, getMe(), getSettings(), teamSummaries()]);
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : "standings";
  const myId = me?.team?.id;
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);

  return (
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
      {view === "scoreboard" && <Scoreboard team={team} />}
      {view === "playoffs" && <Playoffs team={team} />}
      {view === "cap" && <Cap teams={teams} myId={myId} rosterMax={rules.rosterMax} />}

      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-card px-4 py-4 text-sm sm:rounded-b-2xl">
        {me?.team?.is_commish && <Link href="/settings" className="btn-ghost">Commissioner settings</Link>}
        <form action="/auth/signout" method="post" className="ml-auto">
          <button className="btn-ghost">Sign out</button>
        </form>
      </div>
    </div>
  );
}

const pct = (r: Standing) => {
  const games = r.w + r.l + r.t;
  if (!games) return ".000";
  const v = (r.w + r.t / 2) / games;
  return v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, "");
};

function TeamCell({ t }: { t?: TeamSummary }) {
  if (!t) return <span className="text-muted">To be decided</span>;
  return (
    <Link href={`/teams/${t.id}`} prefetch={false} transitionTypes={["nav-forward"]} className="flex min-w-0 items-center gap-3">
      <TeamAvatar name={t.name} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-semibold text-blue">{t.name}</span>
        <span className="block truncate text-xs text-muted">{t.manager_name ?? ""}</span>
      </span>
    </Link>
  );
}

const head = "text-[11px] font-bold uppercase tracking-wide";

async function Standings({ teams, myId }: { teams: TeamSummary[]; myId?: string }) {
  const table = await load(() => standings(teams.map((t) => t.id)));
  if ("err" in table) return <p className="bg-card px-4 py-4 text-sm text-bad">{table.err}</p>;
  const lead = table.ok[0];
  const gb = (r: Standing) => {
    const g = (lead.w - r.w + (r.l - lead.l)) / 2;
    return g <= 0 ? "-" : String(g);
  };
  return (
    <div className="bg-card">
      <div className={`grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_3.5rem_2.5rem] items-center gap-2 border-y border-line px-4 py-2 ${head}`}>
        <span /><span>League standings</span><span className="text-center">Record</span><span className="text-center">Win%</span><span className="text-center">GB</span>
      </div>
      {table.ok.map((r, i) => {
        const t = teams.find((x) => x.id === r.teamId);
        return (
          <div key={r.teamId} className={`grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_3.5rem_2.5rem] items-center gap-2 border-b border-line/60 px-4 py-3 ${r.teamId === myId ? "bg-blue/10" : ""}`}>
            <span className="text-muted">{i + 1}</span>
            <TeamCell t={t} />
            <span className="text-center num">{r.w}-{r.l}-{r.t}</span>
            <span className="text-center num">{pct(r)}</span>
            <span className="text-center num text-muted">{gb(r)}</span>
          </div>
        );
      })}
    </div>
  );
}

async function Scoreboard({ team }: { team: (id: string | null) => TeamSummary | undefined }) {
  const r = await load(async () => {
    const all = await matchups();
    const now = currentOf(all);
    const week = all.filter((m) => m.week === now?.week);
    return { week, s: await scores(week) };
  });
  if ("err" in r) return <p className="bg-card px-4 py-4 text-sm text-bad">{r.err}</p>;
  const { week, s } = r.ok;
  if (!week.length) return <p className="bg-card px-4 py-6 text-center text-sm text-muted">No matchups scheduled yet.</p>;
  return (
    <div className="bg-card">
      <div className={`border-y border-line px-4 py-2 ${head}`}>{weekLabel(week[0])}</div>
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
          <span className="flex min-w-0 items-center gap-3"><TeamAvatar name={team(id)?.name} size="sm" /><span className="truncate font-medium">{team(id)?.name ?? "To be decided"}</span></span>
          <span className="num text-lg font-bold">{pts.toFixed(1)}</span>
        </div>
      ))}
    </Link>
  );
}

async function Playoffs({ team }: { team: (id: string | null) => TeamSummary | undefined }) {
  const r = await load(async () => {
    const all = (await matchups()).filter((m) => m.round !== "regular");
    return { all, s: await scores(all.filter((m) => m.home_team_id && m.away_team_id)) };
  });
  if ("err" in r) return <p className="bg-card px-4 py-4 text-sm text-bad">{r.err}</p>;
  const { all, s } = r.ok;
  if (!all.length) return <p className="bg-card px-4 py-6 text-center text-sm text-muted">Playoffs appear once the schedule is built.</p>;
  const placeholder = (m: Matchup, i: number) =>
    m.round === "final" ? ["Semifinal 1 winner", "Semifinal 2 winner"] : i === 0 ? ["4th seed", "1st seed"] : ["3rd seed", "2nd seed"];
  return (
    <div className="bg-card">
      {(["semi", "final"] as const).map((round) => {
        const games = all.filter((m) => m.round === round);
        if (!games.length) return null;
        return (
          <div key={round}>
            <div className={`border-y border-line px-4 py-2 ${head}`}>{weekLabel(games[0])}</div>
            {games.map((m, i) =>
              m.home_team_id ? (
                <Game key={m.id} m={m} team={team} home={s.get(m.id)?.home ?? 0} away={s.get(m.id)?.away ?? 0} />
              ) : (
                <div key={m.id} className="border-b border-line/60 px-4 py-3 text-sm text-muted">{placeholder(m, i).join(" vs ")}</div>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

async function Cap({ teams, myId, rosterMax }: { teams: TeamSummary[]; myId?: string; rosterMax: number }) {
  const moves = await recentMoves(20);
  return (
    <div className="bg-card">
      <div className={`grid grid-cols-[minmax(0,1fr)_3rem_4rem_4rem] items-center gap-2 border-y border-line px-4 py-2 ${head}`}>
        <span>Cap sheet</span><span className="text-center">Roster</span><span className="text-right">Salary</span><span className="text-right">Space</span>
      </div>
      {teams.map((t) => (
        <div key={t.id} className={`grid grid-cols-[minmax(0,1fr)_3rem_4rem_4rem] items-center gap-2 border-b border-line/60 px-4 py-3 ${t.id === myId ? "bg-blue/10" : ""}`}>
          <TeamCell t={t} />
          <span className="text-center num">{t.state.rosterCount}/{rosterMax}</span>
          <span className="text-right num">{money(t.state.salary)}</span>
          <span className={`text-right num font-semibold ${t.capSpace < 0 ? "text-bad" : ""}`}>{money(t.capSpace)}</span>
        </div>
      ))}
      <div className={`border-y border-line px-4 py-2 ${head}`}>Recent moves</div>
      <div className="px-4 pb-2"><Moves moves={moves} /></div>
    </div>
  );
}
