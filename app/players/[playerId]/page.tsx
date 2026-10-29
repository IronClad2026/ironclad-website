import { cache } from "react";
import { notFound } from "next/navigation";
import PublicPlayerProfileHeader from "@/components/PublicPlayerProfileHeader";
import PublicPlayerStats from "@/components/PublicPlayerStats";
import CombatHighlights from "@/components/combat-highlights/CombatHighlights";
import { getPublicPlayerShowcase } from "@/lib/player-showcase/read";
import { getPublicCombatHighlights } from "@/lib/combat-highlights/read";
import { reportHighlight } from "../highlight-actions";
import { getPublicActiveTournamentEloSnapshots } from "@/lib/active-tournament-elo-snapshots";
import { getPublicPlayerById } from "@/lib/public-players";
import { getPublicPlayerCompetitionHistory, parsePublicHistoryPage } from "@/lib/public-player-competition";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

type PublicPlayerPageProps = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ historyPage?: string | string[] }>;
};

// Share only this render's public profile snapshot between metadata and page.
// Keep the general loader fresh for Server Actions and other request surfaces.
const getPlayerForRequest = cache(getPublicPlayerById);

export async function generateMetadata({ params }: PublicPlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayerForRequest(playerId);
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "public");

  if (!player) {
    return {
      title: translate(copy, "players.notFoundTitle"),
    };
  }

  const displayName = player.playerName || player.displayName;

  return {
    title: translate(copy, "players.profileMetadataTitle", {
      name: displayName,
    }),
    description: translate(copy, "players.profileMetadataDescription", {
      name: displayName,
    }),
  };
}

export default async function PublicPlayerProfilePage({
  params,
  searchParams,
}: PublicPlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayerForRequest(playerId);

  if (!player) {
    notFound();
  }

  const locale = await getRequestLocale();
  const historyPage = parsePublicHistoryPage((await searchParams).historyPage);
  const [activeTournamentEloSnapshots, showcase, clips, badgeDictionary, competitionHistory] =
    await Promise.all([
      getPublicActiveTournamentEloSnapshots(player.id),
      getPublicPlayerShowcase(player.id),
      getPublicCombatHighlights(player.id),
      loadDictionary(locale, "badges"),
      getPublicPlayerCompetitionHistory(player.id, historyPage),
    ]);

  if (competitionHistory.status === "not_found") notFound();

  return (
    <main
      className="min-h-screen bg-black bg-cover bg-center bg-fixed text-white"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/6.jpg')",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <PublicPlayerProfileHeader player={player} showcase={showcase} badgeDictionary={badgeDictionary} />
      <CombatHighlights clips={clips} report={reportHighlight} />
      <PublicPlayerStats
        player={player}
        activeTournamentEloSnapshots={activeTournamentEloSnapshots}
        competitionHistory={competitionHistory}
      />
    </main>
  );
}
