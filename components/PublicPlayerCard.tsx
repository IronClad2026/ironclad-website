"use client";

import {
  ChevronRight,
  Globe2,
  MapPin,
  MessageCircle,
  Shield,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { PublicPlayerProfile } from "@/lib/public-players";

import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import { getLocalizedCountryName, getLocalizedPlayerRegion } from "@/lib/countries";
import englishPublicDictionary from "@/lib/i18n/dictionaries/en/public";
import { formatNumber } from "@/lib/i18n/format";

type PublicPlayerCardProps = {
  player: PublicPlayerProfile;
};

export default function PublicPlayerCard({ player }: PublicPlayerCardProps) {
  const t = useOptionalTranslations("public", englishPublicDictionary);
  const locale = useOptionalLocale();
  const eloLabel =
    typeof player.currentElo === "number"
      ? formatNumber(player.currentElo, locale)
      : t("players.unrated");
  const countryLabel = player.country?.trim()
    ? getLocalizedCountryName(player.country, locale)
    : t("players.unknown");
  const regionLabel = player.region?.trim()
    ? getLocalizedPlayerRegion(player.region, t)
    : t("players.regionUnknown");
  const displayName = player.playerName || player.displayName;

  return (
    <Link
      href={`/players/${player.id}`}
      className="group relative block h-full overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-5 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
    >
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
      </div>

      <div className="relative z-10 flex items-start gap-4">
        <div
          role="img"
          aria-label={t("players.avatarLabel", { name: displayName })}
          className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-orange-400/35 bg-black/55 bg-cover bg-center shadow-[0_0_24px_rgba(249,115,22,0.16)]"
          style={
            player.avatarUrl
              ? { backgroundImage: `url("${player.avatarUrl}")` }
              : undefined
          }
        >
          {!player.avatarUrl && <UserRound size={34} className="text-zinc-600" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-300">
            {t("players.viewProfile")}
          </p>
          <h2 className="mt-2 truncate text-2xl font-black text-white">
            {displayName}
          </h2>
          {player.displayName && player.displayName !== displayName && (
            <p className="mt-1 truncate text-sm font-bold text-zinc-400">
              {player.displayName}
            </p>
          )}
        </div>

        <ChevronRight
          size={20}
          className="mt-1 shrink-0 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-orange-300"
        />
      </div>

      <div className="relative z-10 mt-6 grid gap-3">
        <div className="border border-orange-400/20 bg-orange-500/10 p-4">
          <div className="flex items-center gap-2 text-orange-200">
            <Shield size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em]">
              {t("players.currentElo")}
            </span>
          </div>
          <p className="mt-2 text-3xl font-black text-white">{eloLabel}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Detail
            icon={Globe2}
            label={t("players.country")}
            value={countryLabel}
          />
          <Detail
            icon={MapPin}
            label={t("players.region")}
            value={regionLabel}
          />
        </div>

        {player.discordPublicEnabled && (
          <div className="flex items-center gap-2 border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-200">
            <MessageCircle size={16} />
            {t("players.discordAvailable")}
          </div>
        )}
      </div>
    </Link>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe2;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-white/12 bg-black/45 p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon size={15} />
        <span className="text-[10px] font-black uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-bold text-white">{value}</p>
    </div>
  );
}
