import { ArrowUpRight, Pencil, UserRound } from "lucide-react";
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
    <header className="border-b border-white/15 pb-5 sm:pb-6" data-dashboard-section="header">
      <h1 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
        {t("dashboard.hero.title")}
      </h1>
      <div data-dashboard-section="identity">
        {error ? (
          <p role="alert" className="border-l-2 border-red-400 bg-red-500/10 p-4 text-sm text-red-200">
            {t("dashboard.profile.loadError")}
          </p>
        ) : profile ? (
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-4 sm:gap-x-5 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div
              role="img"
              aria-label={t("dashboard.profile.avatarLabel", { name: profile.display_name })}
              className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-zinc-900 bg-cover bg-center sm:h-20 sm:w-20"
              style={avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined}
            >
              {!avatarUrl && <UserRound size={28} className="text-zinc-400" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                {profile.display_name}
              </h2>
              <p className="mt-1 break-words text-sm font-semibold text-zinc-300">{profile.in_game_name}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm text-zinc-400">
                  <span className="mr-2 text-lg font-black tabular-nums text-orange-300">
                    {profile.current_elo === null ? t("dashboard.notAvailable") : formatNumber(profile.current_elo, locale)}
                  </span>
                  {t("dashboard.profile.currentElo")}
                </p>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${complete ? "text-emerald-300" : "text-orange-300"}`}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {t(complete ? "dashboard.profile.completeStatus" : "dashboard.profile.incompleteStatus")}
                </span>
              </div>
            </div>
            <nav aria-label={t("dashboard.profile.navigation")} className="col-span-2 flex flex-wrap gap-2 xl:col-span-1 xl:justify-end">
              <Link
                href="/tournaments"
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-orange-500 px-3 py-2 text-sm font-bold text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                {t("dashboard.profile.goTournaments")} <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/profile"
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/20 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                <Pencil size={14} aria-hidden="true" />
                {t(complete ? "dashboard.profile.viewEdit" : "dashboard.profile.complete")}
              </Link>
            </nav>
            <dl className="col-span-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1.5 text-xs leading-5 text-zinc-400 xl:col-start-2">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="sr-only">{fact.label}</dt>
                  <dd className="break-words">{fact.value || t("dashboard.notAvailable")}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{t("dashboard.profile.requiredTitle")}</h2>
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
