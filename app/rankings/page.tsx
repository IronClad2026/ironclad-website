import LeaderboardExperience from "@/components/LeaderboardExperience";
import { getPublicLeaderboardData } from "@/lib/leaderboard/public";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leaderboard & Ranking | IronClad",
  description:
    "Track the six-event Main / Pro prize season and permanent Academy and Challenge Career standings.",
};

export default async function RankingsPage() {
  const data = await getPublicLeaderboardData();

  return <LeaderboardExperience data={data} />;
}
