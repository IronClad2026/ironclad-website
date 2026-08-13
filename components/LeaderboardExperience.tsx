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

type LeaderboardExperienceProps = {
  data: PublicLeaderboardData;
};

type PublicRankingView = "main" | "academy" | "challenge";

const rankingOptions: Array<{
  value: PublicRankingView;
  label: string;
}> = [
  {
    value: "main",
    label: "Main / Pro Season",
  },
  {
    value: "academy",
    label: "Academy Career",
  },
  {
    value: "challenge",
    label: "Challenge Career",
  },
];

export default function LeaderboardExperience({
  data,
}: LeaderboardExperienceProps) {
  const [rankingView, setRankingView] = useState<PublicRankingView>("main");
  const isMainSeason = rankingView === "main";
  const scope: LeaderboardScope = isMainSeason ? "season" : "all_time";

  const activeRows = useMemo(() => {
    const source = isMainSeason
      ? data.seasonStandings
      : data.allTimeStandings;

    return source
      .filter((row) => row.bracketType === rankingView)
      .slice()
      .sort(compareRows);
  }, [data.allTimeStandings, data.seasonStandings, isMainSeason, rankingView]);

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

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#030303,#080808_42%,#030303)] text-white">
      <LeaderboardHero
        currentSeason={data.currentSeason}
        rankingView={rankingView}
        playerCount={activeRows.length}
      />

      <section className="relative z-10 mx-auto max-w-[1800px] space-y-10 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {data.errors.length > 0 && (
          <div className="border border-amber-300/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(0,0,0,0.82))] p-5 text-sm font-semibold leading-6 text-amber-100 shadow-2xl shadow-black/30 backdrop-blur">
            Some leaderboard data could not be loaded. The public page is
            showing every safe dataset currently available.
          </div>
        )}

        <ScrollReveal>
          <section className="border border-orange-500/20 bg-black/70 p-4 shadow-2xl shadow-black/25 backdrop-blur sm:p-5">
            <SegmentedControl
              label="Public leaderboard"
              options={rankingOptions}
              value={rankingView}
              onChange={setRankingView}
            />
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
                  Dynamic Standings
                </p>

                <h2 className="mt-3 text-3xl font-black text-white">
                  {getRankingViewLabel(rankingView)}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  {getRankingViewDescription(rankingView)} All rows come from
                  public-safe leaderboard views.
                </p>
              </div>
            </div>

            {!isMainSeason && <CareerExplanation division={rankingView} />}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Visible Competitors"
                value={activeRows.length}
              />

              <MetricCard
                label="Ranking Model"
                value={isMainSeason ? "Six-event season" : "Permanent Career"}
              />

              <MetricCard
                label={isMainSeason ? "Season State" : "Division"}
                value={
                  isMainSeason
                    ? getMainSeasonState(data.currentSeason).shortLabel
                    : getRankingViewLabel(rankingView)
                }
              />
            </div>

            <LeaderboardTable rows={activeRows} scope={scope} />
          </section>
        </ScrollReveal>

        {isMainSeason && (
          <ScrollReveal className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <TournamentHistoryLeaderboard items={historyItems} />
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
  playerCount,
}: {
  currentSeason: PublicLeaderboardSeason | null;
  rankingView: PublicRankingView;
  playerCount: number;
}) {
  const isMainSeason = rankingView === "main";
  const seasonState = getMainSeasonState(currentSeason);
  const validEventCount = Math.min(
    Math.max(currentSeason?.validMainEventCount ?? 0, 0),
    6
  );
  const progressWidth = `${(validEventCount / 6) * 100}%`;

  return (
    <section className="relative overflow-hidden border-b border-orange-500/20 px-6 pt-32 pb-20">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-55"
        style={{
          backgroundImage: "url('/images/ironclad-background.jpg')",
        }}
      />

      <div className="absolute inset-0 bg-black/68" />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.94)),linear-gradient(108deg,rgba(0,0,0,0.96),rgba(0,0,0,0.64),rgba(249,115,22,0.16))]" />

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:64px_64px] opacity-20" />

      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />

      <ScrollReveal className="relative z-10 mx-auto grid max-w-[1800px] gap-10 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.36em] text-orange-300">
            IronClad Competitive Command
          </p>

          <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-tight md:text-7xl xl:text-8xl">
            Leaderboard & Ranking
          </h1>

          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300 md:text-lg">
            Main / Pro is the authoritative six-valid-event prize season.
            Academy and Challenge track separate permanent Career standings.
          </p>
        </div>

        <div className="border border-orange-400/30 bg-black/60 p-5 shadow-[0_0_38px_rgba(0,0,0,0.45)] backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                {isMainSeason ? "Featured Main / Pro Season" : "Career Standings"}
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                {isMainSeason
                  ? currentSeason?.name ?? "Season not started"
                  : getRankingViewLabel(rankingView)}
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                {isMainSeason && currentSeason
                  ? `${formatDate(currentSeason.startDate)} - ${formatDate(
                      currentSeason.endDate
                    )}`
                  : isMainSeason
                    ? "No qualifying season is underway. Standings begin with the first valid Main / Pro event."
                    : "Points remain part of this division's permanent competitive record."}
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
                  <span>Valid qualifying events</span>
                  <span className="shrink-0 text-orange-200">
                    {validEventCount} / 6
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
                  Season results are under review. Displayed standings are
                  historical and are not currently confirmed for prize
                  settlement.
                </div>
              )}
            </>
          ) : (
            <p className="mt-6 border border-orange-300/20 bg-orange-500/[0.06] p-4 text-sm leading-6 text-zinc-300">
              Career points do not reset when a Main / Pro season finishes and
              remain separate from the other Career division.
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <HeroStat label="Competitors" value={playerCount} />

            {isMainSeason ? (
              <>
                <HeroStat
                  label="Season"
                  value={
                    currentSeason ? `S${currentSeason.seasonNumber}` : "TBA"
                  }
                />
                <HeroStat label="State" value={seasonState.shortLabel} />
              </>
            ) : (
              <>
                <HeroStat label="Scope" value="Permanent" />
                <HeroStat label="Reset" value="Never" />
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
  const divisionLabel = division === "academy" ? "Academy" : "Challenge";

  return (
    <div
      role="note"
      className="mt-6 border border-orange-300/20 bg-orange-500/[0.055] p-4 text-sm leading-6 text-zinc-300 sm:p-5"
    >
      <p className="font-black text-white">
        {divisionLabel} is a permanent Career standing.
      </p>
      <p className="mt-2">
        Points do not reset when a Main / Pro season finishes. Academy history
        remains Academy history, Challenge history remains Challenge history,
        and neither Career standing determines Main / Pro seasonal cash prizes.
      </p>
      <p className="mt-2 text-zinc-400">
        New Career entrants may receive +5 points per prior eligible event,
        awarded once per division, up to +25.
      </p>
    </div>
  );
}

function getRankingViewLabel(view: PublicRankingView) {
  return (
    rankingOptions.find((option) => option.value === view)?.label ??
    "Main / Pro Season"
  );
}

function getRankingViewDescription(view: PublicRankingView) {
  if (view === "main") {
    return "Official Main / Pro standings for the featured six-valid-event season.";
  }

  return `${view === "academy" ? "Academy" : "Challenge"} points and results remain in this permanent Career view.`;
}

function getMainSeasonState(season: PublicLeaderboardSeason | null) {
  if (!season) {
    return {
      shortLabel: "Not started",
      description: "Season not started.",
      isFinal: false,
    };
  }

  if (season.isUnderReview) {
    return {
      shortLabel: "Under review",
      description:
        "Frozen historical standings remain displayed while the finalized season is under review.",
      isFinal: true,
    };
  }

  if (season.isFinalized) {
    return {
      shortLabel: "Finalized",
      description: "Finalized. These Main / Pro standings are frozen.",
      isFinal: true,
    };
  }

  if (season.validMainEventCount >= 6) {
    return {
      shortLabel: "Finalization pending",
      description:
        "Finalization pending. Automatic scoring and finalization should normally complete after the sixth valid event.",
      isFinal: false,
    };
  }

  return {
    shortLabel: "In progress",
    description: "Season in progress.",
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
  if (rows.length === 0) {
    return (
      <EmptyPanel
        icon={Crown}
        title="Main / Pro prize positions unavailable"
        message="Official competitive ranks will appear after valid Main / Pro results are published."
      />
    );
  }

  const seasonState = getMainSeasonState(season);

  return (
    <section aria-label="Main / Pro prize positions">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
            {seasonState.isFinal
              ? "Final Main / Pro Standings"
              : "Current Main / Pro Standings"}
          </p>

          <h2 className="mt-2 text-3xl font-black text-white">
            Prize Positions
          </h2>
        </div>

        <p className="max-w-2xl text-sm text-zinc-400">
          Every competitor with official Main / Pro competitive rank 1, 2 or
          3 remains represented. Display order does not change official rank.
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
            Rank #{row.rank ?? "-"}
          </span>

          <RankMovement row={row} />
        </div>

        <div className="mt-7 flex flex-col items-center text-center">
          <Avatar standing={row} size={prominent ? "large" : "medium"} />

          <h3 className="mt-5 max-w-full truncate text-2xl font-black text-white">
            {row.playerName}
          </h3>

          <p className="mt-1 text-sm font-semibold text-zinc-400">
            {row.country || "Unknown"} - ELO {formatElo(row.currentElo)}
          </p>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3">
          <MiniStat label="Points" value={row.totalPoints} />
          <MiniStat label="Wins" value={row.tournamentWins} />
          <MiniStat label="Win Rate" value={`${formatNumber(row.winRate)}%`} />
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
  if (rows.length === 0) {
    return (
      <EmptyPanel
        icon={Target}
        title="No standings published yet"
        message="Leaderboard rows will appear after a valid tournament completion is automatically recalculated."
        className="mt-6"
      />
    );
  }

  return (
    <div className="mt-6 overflow-hidden border border-orange-500/20 shadow-2xl shadow-black/25">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-black/72 text-xs uppercase tracking-wider text-orange-200/70">
            <tr>
              <th className="px-4 py-4">Rank</th>
              <th className="px-4 py-4">Player</th>
              <th className="px-4 py-4">Country</th>
              <th className="px-4 py-4">ELO</th>
              <th className="px-4 py-4">Points</th>
              <th className="px-4 py-4">Played</th>
              <th className="px-4 py-4">Rounds</th>
              <th className="px-4 py-4">Wins</th>
              <th className="px-4 py-4">Win Rate</th>
              <th className="px-4 py-4">Last Pts</th>
              <th className="px-4 py-4">Movement</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10 bg-black/30">
            {rows.map((row) => (
              <tr
                key={`${scope}-${row.bracketType}-${row.playerId ?? `former-${row.displayOrder}`}`}
                className="transition hover:bg-orange-500/12"
              >
                <td className="px-4 py-4 text-lg font-black text-orange-300">
                  #{row.rank ?? "-"}
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
                          {row.region}
                        </p>
                      )}
                    </div>
                  </PlayerProfileContainer>
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {row.country || "Unknown"}
                </td>

                <td className="px-4 py-4 font-bold text-zinc-200">
                  {formatElo(row.currentElo)}
                </td>

                <td className="px-4 py-4 text-lg font-black text-white">
                  {row.totalPoints}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {row.tournamentsPlayed}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {row.roundsPassed}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {row.tournamentWins}
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {formatNumber(row.winRate)}%
                </td>

                <td className="px-4 py-4 text-zinc-300">
                  {scope === "season" ? row.lastTournamentPoints : "-"}
                </td>

                <td className="px-4 py-4">
                  {scope === "season" ? <RankMovement row={row} /> : "-"}
                </td>
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
        Tournament History
      </p>

      <h2 className="mt-3 text-2xl font-black text-white">
        Published Tournament Impact
      </h2>

      {items.length === 0 ? (
        <p className="mt-5 border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-5 text-sm leading-6 text-zinc-400">
          Tournament history will appear here after leaderboard recalculations
          are published.
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
                    {formatBracketLabel(item.bracketType)} - Date TBA
                  </p>
                </div>

                <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-black text-orange-200">
                  {item.points} pts
                </span>
              </div>

              <p className="mt-3 text-sm text-zinc-300">
                Top published scorer:{" "}
                <span className="font-bold text-zinc-200">
                  {item.playerName}
                </span>
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
        Main / Pro Champion Archive
      </p>

      <h2 className="mt-3 text-2xl font-black text-white">
        Latest Finalized Results
      </h2>

      {champions.length === 0 ? (
        <p className="mt-5 border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-5 text-sm leading-6 text-zinc-400">
          Season champions will appear here when a season closes.
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
                  {formatBracketLabel(champion.bracketType)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs font-black uppercase tracking-wider text-orange-300">
                  Rank #{champion.finalRank}
                </p>

                <p className="mt-1 text-sm font-black text-white">
                  {champion.finalPoints} pts
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
  if (row.previousRank === null) {
    return (
      <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs font-black text-sky-200">
        NEW
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
          &uarr; +{Math.abs(row.rankMovement)}
        </>
      ) : (
        <>
          &darr; {Math.abs(row.rankMovement)}
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

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (!Number.isFinite(date.getTime())) {
    return "Date TBA";
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatElo(value: number | null) {
  return typeof value === "number" ? String(value) : "Unrated";
}

function formatBracketLabel(
  bracketType: LeaderboardBracketType
) {
  if (bracketType === "academy") {
    return "Academy Bracket";
  }

  if (bracketType === "main") {
    return "Main / Pro";
  }

  if (bracketType === "challenge") {
    return "Challenge Bracket";
  }

  return "Aggregate";
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
