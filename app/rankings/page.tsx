import LeaderboardExperience from "@/components/LeaderboardExperience";
import { getPublicLeaderboardData } from "@/lib/leaderboard/public";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leaderboard & Ranking | IronClad",
  description:
    "Track IronClad seasonal leaderboard standings, all-time rankings, bracket performance, and champion archives.",
};

export default async function RankingsPage() {
  const data = await getPublicLeaderboardData();

  return <LeaderboardExperience data={data} />;
}
