import { notFound } from "next/navigation";
import { getMe } from "@/lib/auth";
import { teamSummaries } from "@/lib/league";
import TeamView from "@/components/TeamView";

export const dynamic = "force-dynamic";

// Any team's lineup, with a back arrow (to the League tab when opened from outside). Only its owner can make
// changes (on /team).
export default async function TeamPage({ params, searchParams }: PageProps<"/teams/[id]">) {
  const [{ id }, sp, me, teams] = await Promise.all([params, searchParams, getMe(), teamSummaries()]);
  const team = teams.find((t) => t.id === id);
  if (!team) notFound();
  const mine = me?.team?.id === id;
  return <TeamView team={team} editable={mine} base={mine ? "/team" : `/teams/${id}`} sp={sp} back="/league" />;
}
