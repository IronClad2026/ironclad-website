"use client";

import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import DiscordContactButton from "@/components/DiscordContactButton";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import { getLocalizedCountryName, getLocalizedPlayerRegion } from "@/lib/countries";
import type { BadgesDictionary } from "@/lib/i18n/badges";
import englishAccount from "@/lib/i18n/dictionaries/en/account-dashboard";
import englishPublic from "@/lib/i18n/dictionaries/en/public";
import { formatNumber } from "@/lib/i18n/format";
import type { PublicPlayerShowcase } from "@/lib/player-showcase/types";
import type { PublicPlayerProfile } from "@/lib/public-players";
import FeaturedBadgeButton from "./FeaturedBadgeButton";
import { SHOWCASE_SUPPORT_URL } from "./support";

export default function ShowcaseProfileHeader({
  player, showcase, badgeDictionary,
}: {
  player: PublicPlayerProfile;
  showcase: PublicPlayerShowcase;
  badgeDictionary?: BadgesDictionary;
}) {
  const t = useOptionalTranslations("public", englishPublic);
  const s = useOptionalTranslations("account-dashboard", englishAccount);
  const locale = useOptionalLocale();
  const name = player.playerName || player.displayName;
  const facts = [
    {
      label: t("players.currentElo"),
      value: typeof player.currentElo === "number" ? formatNumber(player.currentElo, locale) : t("players.unrated"),
    },
    {
      label: t("players.country"),
      value: player.country?.trim() ? getLocalizedCountryName(player.country, locale) : t("players.unknownCountry"),
    },
    ...(player.region?.trim() ? [{ label: t("players.region"), value: getLocalizedPlayerRegion(player.region, t) }] : []),
  ];

  return (
    <section className="relative border-b border-white/10 px-4 pb-8 pt-28 sm:px-6 sm:pb-12 sm:pt-32" data-player-showcase>
      <div className="mx-auto w-full max-w-[1280px]">
        <Link href="/players" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
          <ArrowLeft size={16} aria-hidden="true" />{t("players.back")}
        </Link>
        <div className="relative mt-5 border border-white/12 bg-[linear-gradient(125deg,rgba(39,39,42,0.8),rgba(12,13,15,0.96)_55%)] p-4 sm:p-7 lg:p-9">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-orange-300/40 via-white/10 to-transparent" />
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-5 sm:gap-x-6 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div
                role="img"
                aria-label={t("players.avatarLabel", { name })}
                className="grid size-20 place-items-center overflow-hidden rounded-sm border border-white/20 bg-zinc-950 bg-cover bg-center sm:size-28"
                style={player.avatarUrl ? { backgroundImage: `url("${player.avatarUrl}")` } : undefined}
              >
                {!player.avatarUrl ? <UserRound size={36} className="text-zinc-500" aria-hidden="true" /> : null}
              </div>
              {showcase.featuredBadge ? (
                <div className="mt-3 w-fit">
                  <FeaturedBadgeButton badge={showcase.featuredBadge} badgeDictionary={badgeDictionary} />
                </div>
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/85">{t("players.profileEyebrow")}</p>
              <h1 className="mt-2 break-words text-3xl font-black leading-[1.08] tracking-tight text-white [overflow-wrap:anywhere] sm:text-5xl lg:text-6xl">{name}</h1>
              {player.displayName && player.displayName !== name ? (
                <p className="mt-2 break-words text-sm text-zinc-400 sm:text-base">{player.displayName}</p>
              ) : null}
              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="text-xs font-semibold text-zinc-400">{fact.label}</dt>
                    <dd className="mt-0.5 break-words text-sm font-semibold text-zinc-100">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {player.discordPublicEnabled && player.discordUsername?.trim() ? <div className="col-span-2 min-w-0 lg:col-span-1 lg:max-w-64">
              <DiscordContactButton presentation="compact" discordPublicEnabled={player.discordPublicEnabled} discordUsername={player.discordUsername} />
            </div> : null}
            {showcase.currentThought ? (
              <div className="col-span-2 min-w-0 border-t border-white/10 pt-5 lg:col-span-3" data-current-thought>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{s("showcase.thoughtTitle")}</p>
                  <a href={SHOWCASE_SUPPORT_URL} className="inline-flex min-h-11 items-center text-xs text-zinc-400 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">{s("showcase.report")}</a>
                </div>
                <p dir="auto" className="mt-2 max-w-[65ch] whitespace-pre-wrap break-words text-base leading-7 text-zinc-200 [overflow-wrap:anywhere]">{showcase.currentThought}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}