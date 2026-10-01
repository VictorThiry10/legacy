import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { playerOverview } from "@/lib/espn";
import { getMe } from "@/lib/auth";
import { getSettings, type Player } from "@/lib/league";
import { money, yearsLeft } from "@/lib/rules";
import { seasonLabel } from "@/lib/player-stats";
import { nbaLogo } from "@/lib/names";
import { waiverFor } from "@/lib/waivers";
import LocalTime from "@/components/LocalTime";
import Slide, { BACK, FORWARD } from "@/components/Slide";

export const dynamic = "force-dynamic";

type Line = { label: string; gp: number; min: number; pts: number; reb: number; ast: number; stl: number; blk: number; to: number; fpts: number };
const TABS = [["overview", "Overview"], ["news", "News"], ["log", "Game Log"], ["moves", "Transactions"]] as const;

// One player, ESPN style: big header card, a stats strip, then Overview / News / Game Log / Transactions.
export default async function PlayerPage({ params, searchParams }: PageProps<"/players/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "overview";
  const d = db();
  const [{ data: player }, { data: contract }, { data: logs }, { data: moves }, overview, me, { season }, onWaivers] = await Promise.all([
    d.from("players").select("*").eq("id", id).maybeSingle(),
    d.from("contracts").select("id, salary, years, season_signed, team:teams(id, name)").eq("player_id", id).eq("active", true).maybeSingle(),
    d.from("player_games").select("*, game:games(start, home_team_id, away_team_id, home_score, away_score)").eq("player_id", id).eq("played", true),
    d.from("transactions").select("kind, created_at, salary, years, note, team:teams!transactions_team_id_fkey(name), other:teams!transactions_other_team_id_fkey(name)").eq("player_id", id).order("created_at", { ascending: false }),
    playerOverview(id),
    getMe(),
    getSettings(),
    getMe().then((m) => waiverFor(id, m?.team?.id)),
  ]);
  if (!player) notFound();
  const p = player as unknown as Player & { injury_note: string | null };
  const c = contract as unknown as { id: string; salary: number; years: number; season_signed: number; team: { id: string; name: string } } | null;
  const w = c ? null : onWaivers;

  // This season so far (our box scores), and last season (ESPN totals).
  type Log = { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; min: number; fpts: number; game: { start: string } };
  const games = ((logs ?? []) as unknown as Log[]).sort((a, b) => b.game.start.localeCompare(a.game.start));
  const lines: Line[] = [];
  if (games.length) {
    const sum = (k: keyof Omit<Log, "game">) => games.reduce((a, g) => a + Number(g[k]), 0);
    lines.push({ label: seasonLabel(season + 1), gp: games.length, min: sum("min"), pts: sum("pts"), reb: sum("reb"), ast: sum("ast"), stl: sum("stl"), blk: sum("blk"), to: sum("tov"), fpts: sum("fpts") });
  }
  const ls = p.last_season;
  if (ls?.gp) lines.push({ label: seasonLabel(ls.season), gp: ls.gp, min: ls.min, pts: ls.pts, reb: ls.reb, ast: ls.ast, stl: ls.stl, blk: ls.blk, to: ls.to, fpts: ls.fpts });
  const main = lines[0];
  const logo = nbaLogo(p.nba_team);
  const tabHref = (k: string) => (k === "overview" ? `/players/${id}` : `/players/${id}?tab=${k}`);

  return (
    <Slide>
      <div className="mx-auto max-w-3xl">
        {/* header card */}
        <div className="relative -mx-4 -mt-6 overflow-hidden bg-gradient-to-b from-line/80 to-card px-4 pb-4 pt-5 sm:mx-0 sm:mt-0 sm:rounded-2xl">
          {logo && <img src={logo} alt="" className="pointer-events-none absolute -right-6 -top-4 h-56 w-56 max-w-none opacity-[0.08]" />}
          {p.headshot && <img src={p.headshot} alt="" className="pointer-events-none absolute bottom-0 right-0 h-40 max-w-none object-contain sm:h-48" />}
          <Link href="/players" transitionTypes={BACK} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-2xl text-muted hover:bg-line" aria-label="Close">×</Link>
          <div className="relative w-[62%] space-y-2">
            <h1 className="text-[26px] font-black uppercase leading-[1.05] tracking-tight">{p.name}</h1>
            <div className="flex items-center gap-1.5 text-sm">
              {logo && <img src={logo} alt="" className="h-5 w-5" />}
              <span>{p.nba_team}</span><span className="text-muted">•</span><span>{p.position ?? "–"}</span>
            </div>
            <div className="text-sm">
              {c ? (
                <>
                  <Link href={`/teams/${c.team.id}`} className="font-medium hover:underline">{c.team.name}</Link>
                  <div className="text-xs text-muted num">{money(Number(c.salary))} · {yearsLeft(c, season)} {yearsLeft(c, season) === 1 ? "yr" : "yrs"} left · ends {seasonLabel(c.season_signed + c.years)}</div>
                </>
              ) : w ? (
                <>
                  <span className="font-medium text-accent">On waivers</span>
                  <div className="text-xs text-muted">Bids close <LocalTime iso={w.waiver.closes_at} mode="day" /> <LocalTime iso={w.waiver.closes_at} /></div>
                </>
              ) : "Free Agent"}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!c && me?.team && (w ? (
                <Link href={`/players/${p.id}/add`} transitionTypes={FORWARD} className="rounded-full bg-accent px-5 py-1.5 text-sm font-semibold text-bg">
                  {w.myBid ? `Your bid ${money(Number(w.myBid.amount))}` : "Bid"}
                </Link>
              ) : (
                <Link href={`/players/${p.id}/add`} transitionTypes={FORWARD} className="rounded-full border-[1.5px] border-accent bg-card px-5 py-1.5 text-sm font-semibold text-accent hover:bg-accent/10">+ Add</Link>
              ))}
              {c && me?.team?.id === c.team.id && <span className="rounded-full bg-line px-3 py-1.5 text-xs font-semibold">On your team</span>}
              {c && me?.team && me.team.id !== c.team.id && (
                <Link href={`/trade/${c.team.id}?get=${c.id}`} transitionTypes={FORWARD} className="rounded-full bg-blue px-5 py-1.5 text-sm font-semibold text-white">Trade</Link>
              )}
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${p.injury_status ? "bg-bad/15 text-bad" : "bg-good/15 text-good"}`} title={p.injury_note ?? ""}>
                {p.injury_status ?? "Healthy"}
              </span>
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="relative z-10 -mx-1 mt-3 grid grid-cols-5 rounded-2xl border border-line bg-card py-3 text-center sm:mx-0">
          <Strip value={overview?.positionRank ? `#${overview.positionRank}` : "–"} label="Pos rank" />
          <Strip value={main?.gp ? (main.fpts / main.gp).toFixed(1) : "–"} label="Avg fpts" />
          <Strip value={main?.gp && main.min ? (main.min / main.gp).toFixed(1) : "–"} label="Min" />
          <Strip value={main ? main.fpts.toFixed(0) : "–"} label={main ? `${main.label} fpts` : "Fpts"} />
          <Strip value={overview?.rostered != null ? overview.rostered.toFixed(1) : "–"} label="% Rost" />
        </div>

        {/* tabs */}
        <nav className="-mx-4 mt-4 flex gap-6 overflow-x-auto border-b border-line px-4 text-sm [scrollbar-width:none] sm:mx-0">
          {TABS.map(([k, label]) => (
            <Link key={k} href={tabHref(k)} scroll={false} className={`shrink-0 border-b-[3px] pb-2.5 font-medium ${tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 space-y-4">
          {tab === "overview" && (
            <>
              <Section title="Season stats">
                {lines.length ? (
                  <div className="-mx-4 overflow-x-auto">
                    <table className="t whitespace-nowrap">
                      <thead>
                        <tr><th className="pl-4"></th>{["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FPTS"].map((h) => <th key={h} className="text-right">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => {
                          const pg = (n: number) => (n / l.gp).toFixed(1);
                          return (
                            <tr key={l.label}>
                              <td className="pl-4 text-muted">{l.label}</td>
                              <td className="num text-right">{l.gp}</td>
                              <td className="num text-right">{l.min ? pg(l.min) : "–"}</td>
                              <td className="num text-right">{pg(l.pts)}</td><td className="num text-right">{pg(l.reb)}</td><td className="num text-right">{pg(l.ast)}</td>
                              <td className="num text-right">{pg(l.stl)}</td><td className="num text-right">{pg(l.blk)}</td><td className="num text-right">{pg(l.to)}</td>
                              <td className="num text-right pr-4 font-semibold">{pg(l.fpts)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-muted">No NBA games yet.</p>}
              </Section>
              {overview?.outlook && (
                <Section title="Outlook">
                  <details className="group">
                    <summary className="list-none cursor-pointer">
                      <p className="text-sm leading-relaxed line-clamp-4 group-open:line-clamp-none">{overview.outlook}</p>
                      <span className="mt-1 inline-block text-sm font-medium text-accent group-open:hidden">Show more</span>
                    </summary>
                  </details>
                </Section>
              )}
              {(overview?.note || !!overview?.news.length) && (
                <Section title="Recent news">
                  <NewsList note={overview?.note ?? null} news={(overview?.news ?? []).slice(0, 3)} />
                  <Link href={tabHref("news")} scroll={false} className="text-sm font-medium text-accent">All news</Link>
                </Section>
              )}
            </>
          )}

          {tab === "news" && (
            <Section title="News">
              {overview && (overview.note || overview.news.length) ? <NewsList note={overview.note} news={overview.news} /> : <p className="text-sm text-muted">No news right now.</p>}
            </Section>
          )}

          {tab === "log" && (
            <Section title="Game log">
              {games.length ? (
                <div className="-mx-4 overflow-x-auto">
                  <table className="t whitespace-nowrap">
                    <thead><tr><th className="pl-4">Date</th>{["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FPTS"].map((h) => <th key={h} className="text-right">{h}</th>)}</tr></thead>
                    <tbody>
                      {games.map((g, i) => (
                        <tr key={i}>
                          <td className="pl-4 text-muted"><LocalTime iso={g.game.start} mode="day" /></td>
                          <td className="num text-right">{g.min}</td><td className="num text-right">{g.pts}</td><td className="num text-right">{g.reb}</td>
                          <td className="num text-right">{g.ast}</td><td className="num text-right">{g.stl}</td><td className="num text-right">{g.blk}</td>
                          <td className="num text-right">{g.tov}</td><td className="num text-right pr-4 font-semibold">{Number(g.fpts).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted">No games played this season yet.</p>}
            </Section>
          )}

          {tab === "moves" && (
            <Section title="Transactions">
              {moves?.length ? (
                <ul className="divide-y divide-line text-sm">
                  {(moves as unknown as { kind: string; created_at: string; salary: number | null; years: number | null; note: string | null; team: { name: string } | null; other: { name: string } | null }[]).map((m, i) => (
                    <li key={i} className="py-2">
                      <div className="flex justify-between gap-3">
                        <span>
                          {m.kind === "sign" && <><b>{m.team?.name}</b> signed him · {money(m.salary ?? 0)}, {m.years}yr</>}
                          {m.kind === "release" && <><b>{m.team?.name}</b> released him</>}
                          {m.kind === "trade" && <><b>{m.team?.name}</b> traded for him from {m.other?.name}</>}
                        </span>
                        <span className="shrink-0 text-xs text-muted"><LocalTime iso={m.created_at} mode="date" /></span>
                      </div>
                      {m.note && <div className="text-xs text-muted">{m.note}</div>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No moves in our league yet.</p>}
            </Section>
          )}

          {!overview && <p className="text-xs text-muted">ESPN didn&apos;t answer this time. Refresh to try again.</p>}
        </div>
      </div>
    </Slide>
  );
}

function Strip({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 px-1">
      <div className="num text-xl font-black leading-tight">{value}</div>
      <div className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="-mx-4 space-y-3 bg-card px-4 py-4 sm:mx-0 sm:rounded-2xl sm:border sm:border-line">
      <h2 className="text-base font-black uppercase tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function NewsList({ note, news }: { note: { headline: string; story: string | null; published: string | null } | null; news: { headline: string; url: string | null; published: string | null }[] }) {
  return (
    <div className="space-y-3">
      {note && (
        <div className="space-y-1">
          <p className="font-semibold">{note.headline}</p>
          {note.story && <p className="text-sm text-muted">{note.story}</p>}
        </div>
      )}
      {news.map((n, i) => (
        <a key={i} href={n.url ?? "#"} target="_blank" rel="noreferrer" className="block text-sm hover:underline">
          {n.headline}
          {n.published && <span className="text-xs text-muted"> · <LocalTime iso={n.published} mode="date" /></span>}
        </a>
      ))}
    </div>
  );
}
