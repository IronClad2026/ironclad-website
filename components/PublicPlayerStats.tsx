"use client";

import { Globe2, MapPin, Shield, Swords } from "lucide-react";
import ActiveTournamentEloSnapshotIndicator, {
  type ActiveTournamentEloSnapshot,
} from "@/components/ActiveTournamentEloSnapshotIndicator";
import ScrollReveal from "@/components/ScrollReveal";
import type { PublicPlayerProfile } from "@/lib/public-players";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import { getLocalizedCountryName, getLocalizedPlayerRegion } from "@/lib/countries";
import englishPublicDictionary from "@/lib/i18n/dictionaries/en/public-players";
import { formatNumber } from "@/lib/i18n/format";
import PublicPlayerCompetitionHistory from "@/components/PublicPlayerCompetitionHistory";
import type { PublicPlayerCompetitionHistory as CompetitionHistory } from "@/lib/public-player-competition-types";

type PublicPlayerStatsProps = {
  player: PublicPlayerProfile;
  activeTournamentEloSnapshots: ActiveTournamentEloSnapshot[];
  competitionHistory: CompetitionHistory;
};

export default function PublicPlayerStats({
  player,
  activeTournamentEloSnapshots,
  competitionHistory,
}: PublicPlayerStatsProps) {
  const t = useOptionalTranslations("public", englishPublicDictionary);
  const locale = useOptionalLocale();
  const stats = [
    {
      label: t("players.currentElo"),
      value:
        typeof player.currentElo === "number"
          ? formatNumber(player.currentElo, locale)
          : t("players.unrated"),
      icon: Shield,
      showsSnapshotIndicator: true,
    },
    {
      label: t("players.country"),
      value: player.country?.trim()
        ? getLocalizedCountryName(player.country, locale)
        : t("players.unknown"),
      icon: Globe2,
      showsSnapshotIndicator: false,
    },
    {
      label: t("players.region"),
      value: player.region?.trim()
        ? getLocalizedPlayerRegion(player.region, t)
        : t("players.regionUnknown"),
      icon: MapPin,
      showsSnapshotIndicator: false,
    },
  ];

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 py-12">
      <ScrollReveal>
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-orange-300">
            <Swords size={15} />
            {t("players.competitiveRecord")}
          </p>
          <h2 className="mt-3 text-3xl font-black text-white">
            {t("players.publicStats")}
          </h2>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`group relative border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 ${
                stat.showsSnapshotIndicator
                  ? "z-20 overflow-visible focus-within:z-30"
                  : "overflow-hidden"
              }`}
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
                  {stat.showsSnapshotIndicator ? (
                    <ActiveTournamentEloSnapshotIndicator
                      snapshots={activeTournamentEloSnapshots}
                    />
                  ) : null}
                </div>
                <p className="mt-4 break-words text-3xl font-black text-white">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <PublicPlayerCompetitionHistory playerId={player.id} history={competitionHistory} />
      </ScrollReveal>
    </section>
  );
}
