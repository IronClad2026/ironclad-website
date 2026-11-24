import { UserRound } from "lucide-react";
import Link from "next/link";
import { getPlayerAvatarDisplayUrl } from "@/lib/avatar";
import { getLocalizedCountryName, getLocalizedPlayerRegion } from "@/lib/countries";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import type { MessageValues } from "@/lib/i18n/types";
import type { PlayerProfile } from "@/lib/player-profile";

type Translator = (path: string, values?: MessageValues) => string;

export default function DashboardIdentity({
  profile,
  error,
  locale,
  t,
}: {
  profile: PlayerProfile | null;
  error: boolean;
  locale: Locale;
  t: Translator;
}) {
  const complete = profile?.profile_completed === true;
  const avatarUrl = profile ? getPlayerAvatarDisplayUrl(profile) : null;
  const facts = profile ? [
    { label: t("dashboard.profile.country"), value: profile.country ? getLocalizedCountryName(profile.country, locale) : null },
    { label: t("dashboard.profile.region"), value: profile.region ? getLocalizedPlayerRegion(profile.region, (path) => t(path)) : null },
    { label: t("dashboard.profile.timezone"), value: profile.timezone },
  ] : [];
  return (
    <header data-dashboard-section="header">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t("dashboard.hero.title")}
      </p>
      <div data-dashboard-section="identity">
        {error ? (
          <p role="alert" className="border-l-2 border-red-400 bg-red-500/10 p-4 text-sm text-red-200">
              {t("dashboard.profile.loadError")}
          </p>
        ) : profile ? (
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 sm:gap-x-4">
            <div
              role="img"
              aria-label={t("dashboard.profile.avatarLabel", { name: profile.display_name })}
              className="row-span-2 mt-1 grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-zinc-900 bg-cover bg-center sm:size-12"
              style={avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined}
            >
              {!avatarUrl && <UserRound size={28} className="text-zinc-400" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-[clamp(1.75rem,4vw,2.6rem)] font-bold leading-tight text-[#f5f1e9]">
                {profile.display_name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <p className="text-sm text-zinc-300">
                  <span className="mr-1.5 tabular-nums">
                    {profile.current_elo === null ? t("dashboard.notAvailable") : formatNumber(profile.current_elo, locale)}
                  </span>
                  {t("dashboard.profile.currentElo")}
                </p>
                {!complete && (
                  <Link href="/profile" className="rounded-sm py-2 text-sm font-semibold text-orange-200 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-orange-300">
                    {t("dashboard.profile.complete")}
                  </Link>
                )}
              </div>
            </div>
            <dl className="col-start-2 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5 text-zinc-400">
              {profile.in_game_name && profile.in_game_name !== profile.display_name && (
                <div className="min-w-0">
                  <dt className="sr-only">In-game name</dt>
                  <dd className="break-words">{profile.in_game_name}</dd>
                </div>
              )}
              {facts.filter((fact) => fact.value).map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="sr-only">{fact.label}</dt>
                  <dd className="break-words">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">{t("dashboard.profile.requiredTitle")}</h1>
              <p className="mt-1 text-sm leading-5 text-zinc-400">{t("dashboard.profile.requiredDescription")}</p>
            </div>
            <Link href="/profile" className="inline-flex min-h-11 items-center bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
              {t("dashboard.profile.complete")}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
