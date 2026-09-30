import { requireTeam, teamSummaries } from "@/lib/league";
import TeamView from "@/components/TeamView";

export const dynamic = "force-dynamic";

export default async function MyTeam({ searchParams }: PageProps<"/team">) {
  const [me, teams, sp] = await Promise.all([requireTeam(), teamSummaries(), searchParams]);
  return <TeamView team={teams.find((t) => t.id === me.id)!} editable base="/team" sp={sp} />;
}
