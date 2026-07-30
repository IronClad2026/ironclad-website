import { Globe2, MapPin, Shield, Swords, Trophy, UsersRound } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";
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
    <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">
      <ScrollReveal>
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-orange-300">
            <Swords size={15} />
            Competitive Record
          </p>
          <h2 className="mt-3 text-3xl font-black text-white">Public Stats</h2>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="group relative overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1"
            >
              <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
              </div>
              <div className="relative z-10">
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
      </ScrollReveal>
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
    <div className="group relative overflow-hidden border border-dashed border-orange-400/25 bg-[linear-gradient(145deg,rgba(249,115,22,0.08),rgba(0,0,0,0.72))] p-6 shadow-2xl shadow-black/20 backdrop-blur transition hover:-translate-y-1">
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 text-orange-300">
          <Icon size={20} />
          <h3 className="text-lg font-black text-white">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}
