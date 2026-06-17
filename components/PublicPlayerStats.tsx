import { Globe2, MapPin, Shield, Swords, Trophy, UsersRound } from "lucide-react";
import type { PublicPlayerProfile } from "@/lib/public-players";

type PublicPlayerStatsProps = {
  player: PublicPlayerProfile;
};

export default function PublicPlayerStats({ player }: PublicPlayerStatsProps) {
  const stats = [
    {
      label: "Current ELO",
      value:
        typeof player.currentElo === "number" ? String(player.currentElo) : "Unrated",
      icon: Shield,
    },
    {
      label: "Country",
      value: player.country?.trim() || "Unknown",
      icon: Globe2,
    },
    {
      label: "Region",
      value: player.region?.trim() || "Region unknown",
      icon: MapPin,
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          <Swords size={15} />
          Competitive Record
        </p>
        <h2 className="mt-3 text-3xl font-black text-white">Public Stats</h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 backdrop-blur"
          >
            <div className="flex items-center gap-3 text-orange-300">
              <stat.icon size={20} />
              <p className="text-[10px] font-black uppercase tracking-[0.22em]">
                {stat.label}
              </p>
            </div>
            <p className="mt-4 break-words text-3xl font-black text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PlaceholderCard
          icon={Trophy}
          title="Tournament History"
          description="Public tournament history will appear here once a public-safe tournament summary loader is available."
        />
        <PlaceholderCard
          icon={UsersRound}
          title="Match Statistics"
          description="Public match statistics will appear here once wins, losses, and match history are available through the public data boundary."
        />
      </div>
    </section>
  );
}

function PlaceholderCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Trophy;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-orange-400/25 bg-orange-500/[0.035] p-6">
      <div className="flex items-center gap-3 text-orange-300">
        <Icon size={20} />
        <h3 className="text-lg font-black text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}
