import LeaderboardExperience from "@/components/LeaderboardExperience";
import { getPublicLeaderboardData } from "@/lib/leaderboard/public";
import type { Metadata } from "next";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "public");

  return {
    title: translate(copy, "rankings.metadataTitle"),
    description: translate(copy, "rankings.metadataDescription"),
  };
}

export default async function RankingsPage() {
  const data = await getPublicLeaderboardData();

  return <LeaderboardExperience data={data} />;
}
