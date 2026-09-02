"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Award,
  BarChart3,
  CalendarDays,
  Crown,
  Medal,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import type {
  LeaderboardBracketType,
  LeaderboardScope,
  PublicLeaderboardData,
  PublicLeaderboardSeason,
  PublicLeaderboardStanding,
  PublicSeasonChampion,
} from "@/lib/leaderboard/public";
import ScrollReveal from "@/components/ScrollReveal";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import {
  formatDateTime,
  formatNumber as formatLocalizedNumber,
} from "@/lib/i18n/format";
import { getLocalizedCountryName, getLocalizedPlayerRegion } from "@/lib/countries";
import type { MessageValues } from "@/lib/i18n/types";
import englishPublicDictionary from "@/lib/i18n/dictionaries/en/public";

type LeaderboardExperienceProps = {
  data: PublicLeaderboardData;
};

type PublicRankingView = "main" | "academy" | "challenge";
type Translator = (path: string, values?: MessageValues) => string;

function usePublicTranslations() {
  return useOptionalTranslations("public", englishPublicDictionary);
}

const rankingOptions: Array<{
  value: PublicRankingView;
  labelKey: string;
}> = [
  {
    value: "main",
    labelKey: "rankings.mainDivision",
  },
  {
    value: "challenge",
    labelKey: "rankings.challengeCareer",
  },
  {
    value: "academy",
    labelKey: "rankings.academyCareer",
  },
];

const mainScopeOptions: Array<{
  value: LeaderboardScope;
  labelKey: string;
}> = [
  {
    value: "season",
    labelKey: "rankings.currentSeasonScope",
  },
  {
    value: "all_time",
    labelKey: "rankings.allTimeScope",
  },
];

export default function LeaderboardExperience({
  data,
}: LeaderboardExperienceProps) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();
  const [rankingView, setRankingView] = useState<PublicRankingView>("main");
  const [mainScope, setMainScope] = useState<LeaderboardScope>("season");
  const isMainView = rankingView === "main";
  const isMainSeason = isMainView && mainScope === "season";
  const scope: LeaderboardScope = isMainView ? mainScope : "all_time";

  const activeRows = useMemo(() => {
    const source = scope === "season"
      ? data.seasonStandings
      : data.allTimeStandings;

    return source
      .filter((row) => row.bracketType === rankingView)
      .slice()
      .sort(compareRows);
  }, [data.allTimeStandings, data.seasonStandings, rankingView, scope]);

  const podiumRows = useMemo(
    () =>
      data.seasonStandings
        .filter(
          (row) =>
            row.bracketType === "main" &&
            row.rank !== null &&
            row.rank <= 3
        )
        .slice()
        .sort(compareRows),
    [data.seasonStandings]
  );

  const historyItems = useMemo(
    () =>
      buildTournamentHistory(
        data.seasonStandings.filter((row) => row.bracketType === "main")
      ),
    [data.seasonStandings]
  );
  const translatedRankingOptions = rankingOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));
  const translatedMainScopeOptions = mainScopeOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#030303,#080808_42%,#030303)] text-white">
      <LeaderboardHero
        currentSeason={data.currentSeason}
        rankingView={rankingView}
        scope={scope}
        playerCount={activeRows.length}
      />

      <section className="relative z-10 mx-auto max-w-[1800px] space-y-10 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {data.errors.length > 0 && (
          <div className="border border-amber-300/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(0,0,0,0.82))] p-5 text-sm font-semibold leading-6 text-amber-100 shadow-2xl shadow-black/30 backdrop-blur">
            {t("rankings.loadWarning")}
          </div>
        )}

        <ScrollReveal>
          <section className="border border-orange-500/20 bg-black/70 p-4 shadow-2xl shadow-black/25 backdrop-blur sm:p-5">
            <SegmentedControl
              label={t("rankings.publicLeaderboard")}
              options={translatedRankingOptions}
              value={rankingView}
              onChange={setRankingView}
            />

            {isMainView && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <SegmentedControl
                  label={t("rankings.mainScope")}
                  options={translatedMainScopeOptions}
                  value={mainScope}
                  onChange={setMainScope}
                />
              </div>
            )}
          </section>
        </ScrollReveal>

        {isMainSeason && (
          <ScrollReveal>
            <LeaderboardPodium
              rows={podiumRows}
              season={data.currentSeason}
            />
          </ScrollReveal>
        )}

        <ScrollReveal>
          <section
            className="border border-orange-500/20 bg-black/70 bg-cover bg-center p-4 shadow-[0_0_45px_rgba(0,0,0,0.48)] backdrop-blur sm:p-6"
            style={{
              backgroundImage:
                "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.78) 48%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.9),rgba(249,115,22,0.1),rgba(0,0,0,0.9)),url('/images/sfondi/4.jpg')",
            }}
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                  <BarChart3 size={16} />
                  {t("rankings.dynamicStandings")}
                </p>

                <h2 className="mt-3 text-3xl font-black text-white">
                  {getActiveRankingLabel(rankingView, scope, t)}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  {getRankingViewDescription(rankingView, scope, t)}{" "}
                  {t("rankings.safeData")}
                </p>
              </div>
            </div>

            {scope === "all_time" &&
              (isMainView ? (
                <MainAllTimeExplanation />
              ) : (
                <CareerExplanation division={rankingView} />
              ))}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MetricCard
                label={t("rankings.visibleCompetitors")}
                value={formatLocalizedNumber(activeRows.length, locale)}
              />

              <MetricCard
                label={t("rankings.rankingModel")}
                value={
                  isMainSeason
                    ? t("rankings.sixEventSeason")
                    : isMainView
                      ? t("rankings.permanentMainPro")
                      : t("rankings.permanentCareer")
                }
              />

              <MetricCard
                label={
                  isMainSeason
                    ? t("rankings.seasonState")
                    : isMainView
                      ? t("rankings.scope")
                      : t("rankings.division")
                }
                value={
                  isMainSeason
                    ? getMainSeasonState(data.currentSeason, t).shortLabel
                    : isMainView
                      ? t("rankings.allTimeScope")
                      : getRankingViewLabel(rankingView, t)
                }
              />
            </div>

            <LeaderboardTable rows={activeRows} scope={scope} />
          </section>
        </ScrollReveal>

        {isMainView && (
          <ScrollReveal
            className={
              isMainSeason
                ? "grid gap-8 xl:grid-cols-[1.15fr_0.85fr]"
                : undefined
            }
          >
            {isMainSeason && (
              <TournamentHistoryLeaderboard items={historyItems} />
            )}
            <SeasonChampionsArchive champions={data.seasonChampions} />
          </ScrollReveal>
        )}
      </section>
    </main>
  );
}

function LeaderboardHero({
  currentSeason,
  rankingView,
  scope,
  playerCount,
}: {
  currentSeason: PublicLeaderboardSeason | null;
  rankingView: PublicRankingView;
  scope: LeaderboardScope;
  playerCount: number;
}) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();
  const isMainView = rankingView === "main";
  const isMainSeason = isMainView && scope === "season";
  const seasonState = getMainSeasonState(currentSeason, t);
  const validEventCount = Math.min(
    Math.max(currentSeason?.validMainEventCount ?? 0, 0),
    6
  );
  const progressWidth = `${(validEventCount / 6) * 100}%`;

  return (
    <section className="relative overflow-hidden border-b border-orange-500/20 px-6 pt-32 pb-20">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-78"
        style={{
          backgroundImage: "url('/images/ironclad-background.jpg')",
        }}
      />

      <div className="absolute inset-0 bg-black/34" />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.94)),linear-gradient(108deg,rgba(0,0,0,0.96),rgba(0,0,0,0.64),rgba(249,115,22,0.16))]" />

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:64px_64px] opacity-20" />

      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />

      <ScrollReveal className="relative z-10 mx-auto grid max-w-[1800px] gap-10 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.36em] text-orange-300">
            {t("rankings.heroEyebrow")}
          </p>

          <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-tight md:text-7xl xl:text-8xl">
            {t("rankings.heroTitle")}
          </h1>

          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300 md:text-lg">
            {t("rankings.heroDescription")}
          </p>
        </div>

        <div className="border border-orange-400/30 bg-black/60 p-5 shadow-[0_0_38px_rgba(0,0,0,0.45)] backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                {isMainSeason
                  ? t("rankings.featuredSeason")
                  : isMainView
                    ? t("rankings.mainAllTime")
                    : t("rankings.careerStandings")}
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                {isMainSeason
                  ? currentSeason?.name ?? t("rankings.seasonNotStarted")
                  : getActiveRankingLabel(rankingView, scope, t)}
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                {isMainSeason && currentSeason
                  ? `${formatDate(currentSeason.startDate, locale, t)} - ${formatDate(
                      currentSeason.endDate,
                      locale,
                      t
                    )}`
                  : isMainSeason
                    ? t("rankings.noSeason")
                    : isMainView
                      ? t("rankings.mainAllTimeRecord")
                      : t("rankings.careerRecord")}
              </p>
            </div>

            <div className="grid h-16 w-16 shrink-0 place-items-center border border-orange-400/35 bg-orange-500/10 text-orange-300 shadow-[0_0_24px_rgba(249,115,22,0.14)]">
              <Trophy size={28} />
            </div>
          </div>

          {isMainSeason ? (
            <>
              <div className="mt-6">
                <div className="flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span>{t("rankings.validEvents")}</span>
                  <span className="shrink-0 text-orange-200">
                    {formatLocalizedNumber(validEventCount, locale)} /{" "}
                    {formatLocalizedNumber(6, locale)}
                  </span>
                </div>

                <div className="mt-3 h-3 overflow-hidden rounded-full border border-orange-400/15 bg-black/70">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-300 shadow-[0_0_18px_rgba(249,115,22,0.55)]"
                    style={{ width: progressWidth }}
                  />
                </div>

                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {seasonState.description}
                </p>
              </div>

              {currentSeason?.isUnderReview && (
                <div
                  role="status"
                  className="mt-5 border border-amber-300/35 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100"
                >
                  {t("rankings.underReviewNotice")}
                </div>
              )}
            </>
          ) : (
            <p className="mt-6 border border-orange-300/20 bg-orange-500/[0.06] p-4 text-sm leading-6 text-zinc-300">
              {isMainView
                ? t("rankings.mainAllTimeNoReset")
                : t("rankings.careerNoReset")}
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <HeroStat
              label={t("rankings.competitors")}
              value={formatLocalizedNumber(playerCount, locale)}
            />

            {isMainSeason ? (
              <>
                <HeroStat
                  label={t("rankings.season")}
                  value={
                    currentSeason
                      ? `S${formatLocalizedNumber(
                          currentSeason.seasonNumber,
                          locale
                        )}`
                      : t("rankings.tba")
                  }
                />
                <HeroStat label={t("rankings.state")} value={seasonState.shortLabel} />
              </>
            ) : (
              <>
                <HeroStat label={t("rankings.scope")} value={t("rankings.permanent")} />
                <HeroStat label={t("rankings.reset")} value={t("rankings.never")} />
              </>
            )}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

function HeroStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-white/12 bg-white/[0.055] p-4 backdrop-blur">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function CareerExplanation({ division }: { division: PublicRankingView }) {
  const t = usePublicTranslations();
  const divisionLabel = division === "academy" ? "Academy" : "Challenge";

  return (
    <div
      role="note"
      className="mt-6 border border-orange-300/20 bg-orange-500/[0.055] p-4 text-sm leading-6 text-zinc-300 sm:p-5"
    >
      <p className="font-black text-white">
        {t("rankings.careerTitle", { division: divisionLabel })}
      </p>
      <p className="mt-2">
        {t("rankings.careerSeparation")}
      </p>
      <p className="mt-2 text-zinc-400">
        {t("rankings.entrantBonus")}
      </p>
    </div>
  );
}

function MainAllTimeExplanation() {
  const t = usePublicTranslations();

  return (
    <div
      role="note"
      className="mt-6 border border-orange-300/20 bg-orange-500/[0.055] p-4 text-sm leading-6 text-zinc-300 sm:p-5"
    >
      <p className="font-black text-white">
        {t("rankings.mainAllTimeRecord")}
      </p>
      <p className="mt-2 text-zinc-400">
        {t("rankings.mainAllTimeNoReset")}
      </p>
    </div>
  );
}

function getRankingViewLabel(view: PublicRankingView, t: Translator) {
  const key = rankingOptions.find((option) => option.value === view)?.labelKey;
  return t(key ?? "rankings.mainDivision");
}

function getActiveRankingLabel(
  view: PublicRankingView,
  scope: LeaderboardScope,
  t: Translator
) {
  if (view === "main") {
    return t(
      scope === "season" ? "rankings.mainSeason" : "rankings.mainAllTime"
    );
  }

  return getRankingViewLabel(view, t);
}

function getRankingViewDescription(
  view: PublicRankingView,
  scope: LeaderboardScope,
  t: Translator
) {
  if (view === "main") {
    return t(
      scope === "season"
        ? "rankings.mainDescription"
        : "rankings.mainAllTimeDescription"
    );
  }

  return t(
    view === "academy"
      ? "rankings.academyDescription"
      : "rankings.challengeDescription"
  );
}

function getMainSeasonState(
  season: PublicLeaderboardSeason | null,
  t: Translator
) {
  if (!season) {
    return {
      shortLabel: t("rankings.notStarted"),
      description: t("rankings.notStartedDescription"),
      isFinal: false,
    };
  }

  if (season.isUnderReview) {
    return {
      shortLabel: t("rankings.underReview"),
      description: t("rankings.underReviewDescription"),
      isFinal: true,
    };
  }

  if (season.isFinalized) {
    return {
      shortLabel: t("rankings.finalized"),
      description: t("rankings.finalizedDescription"),
      isFinal: true,
    };
  }

  if (season.validMainEventCount >= 6) {
    return {
      shortLabel: t("rankings.finalizationPending"),
      description: t("rankings.finalizationPendingDescription"),
      isFinal: false,
    };
  }

  return {
    shortLabel: t("rankings.inProgress"),
    description: t("rankings.inProgressDescription"),
    isFinal: false,
  };
}

function LeaderboardPodium({
  rows,
  season,
}: {
  rows: PublicLeaderboardStanding[];
  season: PublicLeaderboardSeason | null;
}) {
  const t = usePublicTranslations();
  if (rows.length === 0) {
    return (
      <EmptyPanel
        icon={Crown}
        title={t("rankings.topUnavailable")}
        message={t("rankings.topUnavailableText")}
      />
    );
  }

  const seasonState = getMainSeasonState(season, t);

  return (
    <section aria-label={t("rankings.topAria")}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
            {seasonState.isFinal
              ? t("rankings.finalStandings")
              : t("rankings.currentStandings")}
          </p>

          <h2 className="mt-2 text-3xl font-black text-white">
            {t("rankings.topStandings")}
          </h2>
        </div>

        <p className="max-w-2xl text-sm text-zinc-400">
          {t("rankings.tieNotice")}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:items-end">
        {rows.map((row) => (
          <PodiumCard
            key={row.playerId ?? `former-${row.displayOrder}`}
            row={row}
            prominent={row.rank === 1}
          />
        ))}
      </div>
    </section>
  );
}

function PodiumCard({
  row,
  prominent,
}: {
  row: PublicLeaderboardStanding;
  prominent: boolean;
}) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();

  return (
    <PlayerProfileContainer
      playerId={row.playerId}
      className={`group relative block overflow-hidden border p-5 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 ${
        prominent
          ? "border-orange-300/55 bg-[linear-gradient(145deg,rgba(249,115,22,0.24),rgba(20,12,7,0.9),rgba(255,255,255,0.055))] shadow-orange-950/25 lg:min-h-[380px]"
          : "border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] lg:min-h-[330px]"
      }`}
    >
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-orange-200">
            <Medal size={15} />
            {t("rankings.rankNumber", {
              rank:
                typeof row.rank === "number"
                  ? formatLocalizedNumber(row.rank, locale)
                  : "-",
            })}
          </span>

          <RankMovement row={row} />
        </div>

        <div className="mt-7 flex flex-col items-center text-center">
          <Avatar standing={row} size={prominent ? "large" : "medium"} />

          <h3 className="mt-5 max-w-full truncate text-2xl font-black text-white">
            {row.playerName}
          </h3>

          <p className="mt-1 text-sm font-semibold text-zinc-400">
            {row.country
              ? getLocalizedCountryName(row.country, locale)
              : t("rankings.unknown")}{" "}
            · ELO {formatElo(row.currentElo, locale, t)}
          </p>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3">
          <MiniStat
            label={t("rankings.points")}
            value={formatLocalizedNumber(row.totalPoints, locale)}
          />
          <MiniStat
            label={t("rankings.wins")}
            value={formatLocalizedNumber(row.tournamentWins, locale)}
          />
          <MiniStat
            label={t("rankings.winRate")}
            value={formatLocalizedNumber(row.winRate / 100, locale, {
              style: "percent",
              maximumFractionDigits: 2,
            })}
          />
        </div>
      </div>
    </PlayerProfileContainer>
  );
}

function LeaderboardTable({
  rows,
  scope,
}: {
  rows: PublicLeaderboardStanding[];
  scope: LeaderboardScope;
}) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();

  if (rows.length === 0) {
    return (
      <EmptyPanel
        icon={Target}
        title={t("rankings.noStandings")}
        message={t("rankings.noStandingsText")}
        className="mt-6"
      />
    );
  }

  return (
    <div className="mt-6 overflow-hidden border border-orange-500/20 shadow-2xl shadow-black/25">
      <div className="overflow-x-auto">
        <table
          className={`w-full text-left text-sm ${
            scope === "season" ? "min-w-[1040px]" : "min-w-[850px]"
          }`}
        >
          <thead className="bg-black/72 text-xs uppercase tracking-wider text-orange-200/70">
            <tr>
              <th className="px-4 py-4">{t("rankings.rank")}</th>
              <th className="px-4 py-4">{t("rankings.player")}</th>
              <th className="px-4 py-4">{t("rankings.country")}</th>
              <th className="px-4 py-4">{t("rankings.elo")}</th>
              <th className="px-4 py-4">{t("rankings.points")}</th>
              <th className="px-4 py-4">{t("rankings.played")}</th>
              <th className="px-4 py-4">{t("rankings.rounds")}</th>
              <th className="px-4 py-4">{t("rankings.wins")}</th>
              <th className="px-4 py-4">{t("rankings.winRate")}</th>
              {scope === "season" && (
                <>
                  <th className="px-4 py-4">{t("rankings.lastPoints")}</th>
                  <th className="px-4 py-4">{t("rankings.movement")}</th>
                </>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10 bg-black/30">
            {rows.map((row) => (
              <tr
                key={`${scope}-${row.bracketType}-${row.playerId ?? `former-${row.displayOrder}`}`}
                className="transition hover:bg-orange-500/12"
              >
                <td className="px-4 py-4 text-lg font-black text-orange-300">
                  #
                  {typeof row.rank === "number"
                    ? formatLocalizedNumber(row.rank, locale)
                    : "-"}
                </td>

                <td className="px-4 py-4">
                  <PlayerProfileContainer
                    playerId={row.playerId}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Avatar standing={row} size="small" />

                    <div className="min-w-0">
                      <p className="truncate font-black text-white">
                        {row.playerName}
                      </p>

                      {row.region && (
                        <p className="truncate text-xs text-zinc-400">
                          {getLocalizedPlayerRegion(row.region, t)}
                        </p>
                      )}
                    </div>
                  </PlayerProfileContainer>
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {row.country
                    ? getLocalizedCountryName(row.country, locale)
                    : t("rankings.unknown")}
                </td>

                <td className="px-4 py-4 font-bold text-zinc-200">
                  {formatElo(row.currentElo, locale, t)}
                </td>

                <td className="px-4 py-4 text-lg font-black text-white">
                  {formatLocalizedNumber(row.totalPoints, locale)}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {formatLocalizedNumber(row.tournamentsPlayed, locale)}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {formatLocalizedNumber(row.roundsPassed, locale)}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {formatLocalizedNumber(row.tournamentWins, locale)}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {formatLocalizedNumber(row.winRate / 100, locale, {
                    style: "percent",
                    maximumFractionDigits: 2,
                  })}
                </td>

                {scope === "season" && (
                  <>
                    <td className="px-4 py-4 text-zinc-300">
                      {formatLocalizedNumber(row.lastTournamentPoints, locale)}
                    </td>

                    <td className="px-4 py-4">
                      <RankMovement row={row} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{
    value: T;
    label: string;
    description?: string;
  }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">
        {label}
      </p>

      <div
        role="group"
        aria-label={label}
        className={`grid gap-2 border border-orange-500/20 bg-black/55 p-2 shadow-inner shadow-black/30 ${
          options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-xl px-3 py-2 text-left text-xs font-black uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
                active
                  ? "border border-orange-300/55 bg-orange-500/20 text-orange-100 shadow-[0_0_18px_rgba(249,115,22,0.12)]"
                  : "border border-transparent text-zinc-400 hover:border-orange-300/25 hover:bg-white/[0.055] hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TournamentHistoryLeaderboard({
  items,
}: {
  items: TournamentHistoryItem[];
}) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();

  return (
    <section
      className="border border-orange-500/20 bg-black/70 bg-cover bg-center p-6 shadow-2xl shadow-black/25 backdrop-blur"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.77) 48%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.9),rgba(249,115,22,0.08),rgba(0,0,0,0.88)),url('/images/sfondi/2.jpg')",
      }}
    >
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-300">
        <CalendarDays size={16} />
        {t("rankings.history")}
      </p>

      <h2 className="mt-3 text-2xl font-black text-white">
        {t("rankings.historyTitle")}
      </h2>

      {items.length === 0 ? (
        <p className="mt-5 border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-5 text-sm leading-6 text-zinc-400">
          {t("rankings.historyEmpty")}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.slice(0, 6).map((item) => (
            <div
              key={`${item.tournamentId}-${item.bracketType}`}
              className="border border-white/12 bg-black/45 p-4 shadow-xl shadow-black/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black text-white">{item.title}</p>

                  <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
                    {formatBracketLabel(item.bracketType, t)} ·{" "}
                    {t("rankings.dateTba")}
                  </p>
                </div>

                <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-black text-orange-200">
                  {t("rankings.pointsShort", {
                    points: formatLocalizedNumber(item.points, locale),
                  })}
                </span>
              </div>

              <p className="mt-3 text-sm text-zinc-300">
                {t("rankings.topScorer", { name: item.playerName })}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SeasonChampionsArchive({
  champions,
}: {
  champions: PublicSeasonChampion[];
}) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();

  return (
    <section
      className="border border-orange-500/20 bg-black/70 bg-cover bg-center p-6 shadow-2xl shadow-black/25 backdrop-blur"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.78) 48%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.92),rgba(249,115,22,0.08),rgba(0,0,0,0.9)),url('/images/sfondi/3.jpg')",
      }}
    >
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-300">
        <Award size={16} />
        {t("rankings.championArchive")}
      </p>

      <h2 className="mt-3 text-2xl font-black text-white">
        {t("rankings.latestFinalized")}
      </h2>

      {champions.length === 0 ? (
        <p className="mt-5 border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-5 text-sm leading-6 text-zinc-400">
          {t("rankings.championsEmpty")}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {champions.map((champion) => (
            <PlayerProfileContainer
              key={champion.id}
              playerId={champion.playerId}
              className="flex items-center gap-4 border border-white/12 bg-black/45 p-4 transition hover:border-orange-400/45 hover:bg-orange-500/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            >
              <div
                className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-orange-400/35 bg-black/55 bg-cover bg-center shadow-[0_0_20px_rgba(249,115,22,0.12)]"
                style={
                  champion.avatarUrl
                    ? {
                        backgroundImage: `url("${champion.avatarUrl}")`,
                      }
                    : undefined
                }
              >
                {!champion.avatarUrl && (
                  <UserRound size={22} className="text-zinc-600" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-white">
                  {champion.playerName}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  {champion.seasonName} -{" "}
                  {formatBracketLabel(champion.bracketType, t)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs font-black uppercase tracking-wider text-orange-300">
                  {t("rankings.rankNumber", {
                    rank: formatLocalizedNumber(champion.finalRank, locale),
                  })}
                </p>

                <p className="mt-1 text-sm font-black text-white">
                  {t("rankings.pointsShort", {
                    points: formatLocalizedNumber(champion.finalPoints, locale),
                  })}
                </p>
              </div>
            </PlayerProfileContainer>
          ))}
        </div>
      )}
    </section>
  );
}

function Avatar({
  standing,
  size,
}: {
  standing: PublicLeaderboardStanding;
  size: "small" | "medium" | "large";
}) {
  const className =
    size === "large"
      ? "h-24 w-24 rounded-3xl"
      : size === "medium"
        ? "h-20 w-20 rounded-2xl"
        : "h-11 w-11 rounded-xl";

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden border border-orange-400/35 bg-black/55 bg-cover bg-center shadow-[0_0_24px_rgba(249,115,22,0.16)] ${className}`}
      style={
        standing.avatarUrl
          ? {
              backgroundImage: `url("${standing.avatarUrl}")`,
            }
          : undefined
      }
    >
      {!standing.avatarUrl && (
        <UserRound
          size={size === "large" ? 44 : size === "medium" ? 34 : 20}
          className="text-zinc-600"
        />
      )}
    </div>
  );
}

function RankMovement({
  row,
}: {
  row: PublicLeaderboardStanding;
}) {
  const t = usePublicTranslations();
  const locale = useOptionalLocale();

  if (row.previousRank === null) {
    return (
      <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs font-black text-sky-200">
        {t("rankings.new")}
      </span>
    );
  }

  if (!row.rankMovement) {
    return <span className="text-sm font-bold text-zinc-500">*</span>;
  }

  const movedUp = row.rankMovement > 0;

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-black ${
        movedUp
          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
          : "border-red-400/25 bg-red-500/10 text-red-200"
      }`}
    >
      {movedUp ? (
        <>
          &uarr; +{formatLocalizedNumber(Math.abs(row.rankMovement), locale)}
        </>
      ) : (
        <>
          &darr; {formatLocalizedNumber(Math.abs(row.rankMovement), locale)}
        </>
      )}
    </span>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-white/12 bg-black/45 p-4 shadow-xl shadow-black/10">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-white/12 bg-black/45 p-3 text-center">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  message,
  className = "",
}: {
  icon: typeof Trophy;
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <section
      className={`border border-dashed border-orange-400/30 bg-[linear-gradient(145deg,rgba(249,115,22,0.08),rgba(0,0,0,0.72))] p-8 text-center shadow-2xl shadow-black/20 backdrop-blur ${className}`}
    >
      <div className="mx-auto grid h-14 w-14 place-items-center border border-orange-400/25 bg-orange-500/10 text-orange-300">
        <Icon size={24} />
      </div>

      <h2 className="mt-5 text-2xl font-black text-white">{title}</h2>

      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
        {message}
      </p>
    </section>
  );
}

type TournamentHistoryItem = {
  tournamentId: string;
  title: string;
  bracketType: LeaderboardBracketType;
  playerName: string;
  points: number;
};

function buildTournamentHistory(
  rows: PublicLeaderboardStanding[]
): TournamentHistoryItem[] {
  const items = new Map<string, TournamentHistoryItem>();

  for (const row of rows) {
    if (!row.lastTournamentId || !row.lastTournamentTitle) {
      continue;
    }

    const key = `${row.lastTournamentId}:${row.bracketType}`;
    const existing = items.get(key);

    if (existing && existing.points >= row.lastTournamentPoints) {
      continue;
    }

    items.set(key, {
      tournamentId: row.lastTournamentId,
      title: row.lastTournamentTitle,
      bracketType: row.bracketType,
      playerName: row.playerName,
      points: row.lastTournamentPoints,
    });
  }

  return [...items.values()].sort(
    (left, right) => right.points - left.points
  );
}

function compareRows(
  left: PublicLeaderboardStanding,
  right: PublicLeaderboardStanding
) {
  return (
    (left.rank ?? Number.MAX_SAFE_INTEGER) -
      (right.rank ?? Number.MAX_SAFE_INTEGER) ||
    right.totalPoints - left.totalPoints ||
    right.tournamentWins - left.tournamentWins ||
    right.roundsPassed - left.roundsPassed ||
    right.winRate - left.winRate ||
    left.playerName.localeCompare(right.playerName) ||
    left.displayOrder - right.displayOrder
  );
}

function formatDate(
  value: string,
  locale: ReturnType<typeof useOptionalLocale>,
  t: Translator
) {
  const date = new Date(`${value}T00:00:00Z`);

  if (!Number.isFinite(date.getTime())) {
    return t("rankings.dateTba");
  }

  return formatDateTime(date, locale, { kind: "utc" }, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatElo(
  value: number | null,
  locale: ReturnType<typeof useOptionalLocale>,
  t: Translator
) {
  return typeof value === "number"
    ? formatLocalizedNumber(value, locale)
    : t("rankings.unrated");
}

function formatBracketLabel(
  bracketType: LeaderboardBracketType,
  t: Translator
) {
  if (bracketType === "academy") {
    return t("rankings.academyBracket");
  }

  if (bracketType === "main") {
    return "Main / Pro";
  }

  if (bracketType === "challenge") {
    return t("rankings.challengeBracket");
  }

  return t("rankings.aggregate");
}

function PlayerProfileContainer({
  playerId,
  className,
  children,
}: {
  playerId: string | null;
  className: string;
  children: ReactNode;
}) {
  if (!playerId) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Link href={`/players/${playerId}`} className={className}>
      {children}
    </Link>
  );
}
