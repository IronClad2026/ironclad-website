import { Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import DashboardReadyWardrobe from "@/components/dashboard/DashboardReadyWardrobe";
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
  showcaseEnabled = false,
  wardrobeEnabled = false,
}: {
  profile: PlayerProfile | null;
  error: boolean;
  locale: Locale;
  t: Translator;
  showcaseEnabled?: boolean;
  wardrobeEnabled?: boolean;
}) {
  const complete = profile?.profile_completed === true;
  const avatarUrl = profile ? getPlayerAvatarDisplayUrl(profile) : null;
  const facts = profile ? [
    { label: t("dashboard.profile.country"), value: profile.country ? getLocalizedCountryName(profile.country, locale) : null },
    { label: t("dashboard.profile.region"), value: profile.region ? getLocalizedPlayerRegion(profile.region, (path) => t(path)) : null },
    { label: t("dashboard.profile.timezone"), value: profile.timezone },
  ] : [];
  return (
    <header className="border-b border-white/15 pb-3 sm:pb-4" data-dashboard-section="header">
      <h1 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-300">
        {t("dashboard.hero.title")}
      </h1>
      <div data-dashboard-section="identity">
        {error ? (
          <>
            <p role="alert" className="border-l-2 border-red-400 bg-red-500/10 p-4 text-sm text-red-200">
              {t("dashboard.profile.loadError")}
            </p>
            {wardrobeEnabled ? <DashboardReadyWardrobe /> : null}
          </>
        ) : profile ? (
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:gap-x-4 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div
              role="img"
              aria-label={t("dashboard.profile.avatarLabel", { name: profile.display_name })}
              className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-zinc-900 bg-cover bg-center sm:size-14"
              style={avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined}
            >
              {!avatarUrl && <UserRound size={28} className="text-zinc-400" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                {profile.display_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-zinc-400">
                  <span className="mr-1.5 text-sm font-bold tabular-nums text-orange-300">
                    {profile.current_elo === null ? t("dashboard.notAvailable") : formatNumber(profile.current_elo, locale)}
                  </span>
                  {t("dashboard.profile.currentElo")}
                </p>
                <span className={`text-xs font-semibold ${complete ? "text-emerald-300" : "text-orange-300"}`}>
                  {t(complete ? "dashboard.profile.completeStatus" : "dashboard.profile.incompleteStatus")}
                </span>
              </div>
            </div>
            {wardrobeEnabled ? <DashboardReadyWardrobe /> : null}
            <nav aria-label={t("dashboard.profile.navigation")} className="col-span-2 flex flex-wrap gap-x-4 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:justify-end">
              <Link
                href="/profile"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-200 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-orange-300"
              >
                <Pencil size={14} aria-hidden="true" />
                {t(complete ? "dashboard.profile.viewEdit" : "dashboard.profile.complete")}
              </Link>
              {showcaseEnabled ? (
                <Link href="/dashboard/showcase" className="inline-flex min-h-11 items-center text-sm font-semibold text-zinc-200 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-orange-300">
                  {t("showcase.manage")}
                </Link>
              ) : null}
            </nav>
            <dl className="col-span-full flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5 text-zinc-400 xl:col-start-2">
              {profile.in_game_name && profile.in_game_name !== profile.display_name && (
                <div className="min-w-0">
                  <dt className="sr-only">In-game name</dt>
                  <dd className="break-words">{profile.in_game_name}</dd>
                </div>
              )}
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="sr-only">{fact.label}</dt>
                  <dd className="break-words">{fact.value || t("dashboard.notAvailable")}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:has-[[data-wardrobe-expanded=true]]:flex-col sm:has-[[data-wardrobe-expanded=true]]:items-start">
            <div className="min-w-0 has-[>[data-wardrobe-expanded=true]]:w-full">
              <h2 className="text-xl font-bold text-white">{t("dashboard.profile.requiredTitle")}</h2>
              {wardrobeEnabled ? <DashboardReadyWardrobe /> : null}
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
