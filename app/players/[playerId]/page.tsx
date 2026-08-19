import { notFound } from "next/navigation";
import PublicPlayerProfileHeader from "@/components/PublicPlayerProfileHeader";
import PublicPlayerStats from "@/components/PublicPlayerStats";
import { getPublicActiveTournamentEloSnapshots } from "@/lib/active-tournament-elo-snapshots";
import { getPublicPlayerById } from "@/lib/public-players";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

type PublicPlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

export async function generateMetadata({ params }: PublicPlayerPageProps) {
  const { playerId } = await params;
  const player = await getPublicPlayerById(playerId);
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
}: PublicPlayerPageProps) {
  const { playerId } = await params;
  const player = await getPublicPlayerById(playerId);

  if (!player) {
    notFound();
  }

  const activeTournamentEloSnapshots =
    await getPublicActiveTournamentEloSnapshots(player.id);

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
      <PublicPlayerProfileHeader player={player} />
      <PublicPlayerStats
        player={player}
        activeTournamentEloSnapshots={activeTournamentEloSnapshots}
      />
    </main>
  );
}
