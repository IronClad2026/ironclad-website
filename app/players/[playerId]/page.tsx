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
      <PublicPlayerStats player={player} />
    </main>
  );
}
