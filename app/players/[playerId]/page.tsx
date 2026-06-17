import { notFound } from "next/navigation";
import PublicPlayerProfileHeader from "@/components/PublicPlayerProfileHeader";
import PublicPlayerStats from "@/components/PublicPlayerStats";
import { getPublicPlayerById } from "@/lib/public-players";

export const dynamic = "force-dynamic";

type PublicPlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

export async function generateMetadata({ params }: PublicPlayerPageProps) {
  const { playerId } = await params;
  const player = await getPublicPlayerById(playerId);

  if (!player) {
    return {
      title: "Player Not Found | IronClad",
    };
  }

  const displayName = player.playerName || player.displayName;

  return {
    title: `${displayName} | IronClad Player Profile`,
    description: `Public IronClad player profile for ${displayName}.`,
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

  return (
    <main className="min-h-screen bg-black text-white">
      <PublicPlayerProfileHeader player={player} />
      <PublicPlayerStats player={player} />
    </main>
  );
}
