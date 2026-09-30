import Link from "next/link";
import { getMe, teamSummaries } from "@/lib/league";
import { currentOf, matchups, score, standings } from "@/lib/fantasy";
import { weekLabel } from "@/lib/lineup";
import { load } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [me, teams] = await Promise.all([getMe(), teamSummaries()]);
  if (!me?.team) return <p className="card">{me?.email} is not on a team yet. Ask the commissioner to add you.</p>;
  const myId = me.team.id;
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  return (
    <div className="grid gap-4 sm:grid-cols-2 items-start">
      <section className="card space-y-3">
        <Head title="Current matchup" href="/matchup" link="Details" />
        <CurrentMatchup myId={myId} name={name} />
      </section>
      <section className="card space-y-3">
        <Head title="League standings" href="/league" link="Full table" />
        <Standings myId={myId} teamIds={teams.map((t) => t.id)} name={name} />
      </section>
    </div>
  );
}

function Head({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-baseline">
      <h2 className="font-semibold">{title}</h2>
      <Link href={href} className="ml-auto text-xs text-muted hover:text-fg">{link} →</Link>
    </div>
  );
}

async function CurrentMatchup({ myId, name }: { myId: string; name: (id: string) => string }) {
  const r = await load(async () => {
    const m = currentOf(await matchups(myId));
    return m ? { m, s: (await score([m])).get(m.id)! } : null;
  });
  if ("err" in r) return <p className="text-sm text-bad">{r.err}</p>;
  if (!r.ok) return <p className="text-sm text-muted">No matchups scheduled yet.</p>;
  const { m, s } = r.ok;
  const sides: [string, number][] = [[m.home_team_id, s.home], [m.away_team_id, s.away]];
  if (m.away_team_id === myId) sides.reverse();
  return (
    <Link href="/matchup" className="block space-y-2">
      <div className="text-xs text-muted">{weekLabel(m)}</div>
      {sides.map(([id, pts]) => (
        <div key={id} className={`flex items-baseline gap-3 ${id === myId ? "font-semibold" : ""}`}>
          <span className="truncate">{name(id)}</span>
          <span className="ml-auto num text-2xl">{pts}</span>
        </div>
      ))}
    </Link>
  );
}

async function Standings({ myId, teamIds, name }: { myId: string; teamIds: string[]; name: (id: string) => string }) {
  const r = await load(() => standings(teamIds));
  if ("err" in r) return <p className="text-sm text-bad">{r.err}</p>;
  return (
    <table className="t">
      <thead><tr><th>#</th><th>Team</th><th className="text-right">W-L-T</th><th className="text-right">PF</th></tr></thead>
      <tbody>
        {r.ok.map((row, i) => (
          <tr key={row.teamId} className={row.teamId === myId ? "font-medium" : ""}>
            <td className="text-muted num">{i + 1}</td>
            <td><Link href={`/teams/${row.teamId}`} className="hover:underline">{name(row.teamId)}</Link></td>
            <td className="num text-right">{row.w}-{row.l}-{row.t}</td>
            <td className="num text-right">{Math.round(row.pf)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
