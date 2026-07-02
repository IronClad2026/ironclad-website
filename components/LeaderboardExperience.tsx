"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

type LeaderboardExperienceProps = {
  data: PublicLeaderboardData;
};

const bracketOptions: Array<{
  value: LeaderboardBracketType;
  label: string;
  description: string;
}> = [
  {
    value: "overall",
    label: "Overall",
    description: "Academy, Challenge, and Main combined",
  },
  {
    value: "academy",
    label: "Academy Bracket",
    description: "Academy bracket scoring",
  },
  {
    value: "challenge",
    label: "Challenge Bracket",
    description: "Challenge bracket scoring",
  },
  {
    value: "main",
    label: "Main / Elite Bracket",
    description: "Main / Elite bracket scoring",
  },
];

const scopeOptions: Array<{ value: LeaderboardScope; label: string }> = [
  { value: "season", label: "Current Season" },
  { value: "all_time", label: "All Time" },
];

export default function LeaderboardExperience({
  data,
}: LeaderboardExperienceProps) {
  const [scope, setScope] = useState<LeaderboardScope>("season");
  const [bracketType, setBracketType] =
    useState<LeaderboardBracketType>("overall");
  const activeRows = useMemo(() => {
    const source =
      scope === "season" ? data.seasonStandings : data.allTimeStandings;
    return source
      .filter((row) => row.bracketType === bracketType)
      .slice()
      .sort(compareRows);
  }, [bracketType, data.allTimeStandings, data.seasonStandings, scope]);
  const podiumRows = useMemo(
    () =>
      data.seasonStandings
        .filter((row) => row.bracketType === "overall")
        .slice()
        .sort(compareRows)
        .slice(0, 3),
    [data.seasonStandings]
  );
  const historyItems = useMemo(
    () => buildTournamentHistory(data.seasonStandings),
    [data.seasonStandings]
  );

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <LeaderboardHero
        currentSeason={data.currentSeason}
        seasonProgress={data.currentSeasonProgress}
        playerCount={data.seasonStandings.filter(
          (row) => row.bracketType === "overall"
        ).length}
      />

      <section className="mx-auto max-w-[1800px] space-y-10 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {data.errors.length > 0 && (
          <div className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5 text-sm font-semibold leading-6 text-amber-100">
            Some leaderboard data could not be loaded. The public page is
            showing every safe dataset currently available.
          </div>
        )}

        <LeaderboardPodium rows={podiumRows} />

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/25 backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-400">
                <BarChart3 size={16} />
                Dynamic Standings
              </p>
              <h2 className="mt-3 text-3xl font-black text-white">
                Player Ranking
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Switch between seasonal and all-time standings, then filter by
                bracket. All rows come from public-safe leaderboard views.
              </p>
            </div>

            <div className="grid gap-3 lg:min-w-[720px] lg:grid-cols-[0.85fr_1.15fr]">
              <SegmentedControl
                label="Ranking Scope"
                options={scopeOptions}
                value={scope}
                onChange={setScope}
              />
              <SegmentedControl
                label="Bracket"
                options={bracketOptions}
                value={bracketType}
                onChange={setBracketType}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Visible Players" value={activeRows.length} />
            <MetricCard
              label="Ranking Scope"
              value={scope === "season" ? "Season" : "All Time"}
            />
            <MetricCard
              label="Bracket"
              value={
                bracketOptions.find((option) => option.value === bracketType)
                  ?.label ?? "Overall"
              }
            />
          </div>

          <LeaderboardTable rows={activeRows} scope={scope} />
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <TournamentHistoryLeaderboard items={historyItems} />
          <SeasonChampionsArchive champions={data.seasonChampions} />
        </div>
      </section>
    </main>
  );
}

function LeaderboardHero({
  currentSeason,
  seasonProgress,
  playerCount,
}: {
  currentSeason: PublicLeaderboardSeason | null;
  seasonProgress: number;
  playerCount: number;
}) {
  const progress = currentSeason ? seasonProgress : 0;

  return (
    <section className="relative overflow-hidden border-b border-orange-500/20 px-6 pt-32 pb-20">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-55"
        style={{
          backgroundImage:
            "url('/images/leaderboard/ironclad-leaderboard-bg.png')",
        }}
      />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.28),transparent_34%),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.76),rgba(67,20,7,0.74))]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />

      <div className="relative z-10 mx-auto grid max-w-[1800px] gap-10 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.36em] text-orange-300">
            IronClad Competitive Command
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-tight md:text-7xl xl:text-8xl">
            Leaderboard & Ranking
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300 md:text-lg">
            Track IronClad seasonal performance across Academy, Challenge, and
            Main / Elite brackets. Points reset between seasons while all-time
            achievements remain archived.
          </p>
        </div>

        <div className="rounded-3xl border border-orange-400/25 bg-black/55 p-5 shadow-2xl shadow-orange-950/20 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                Current Season
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                {currentSeason?.name ?? "Season Pending"}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {currentSeason
                  ? `${formatDate(currentSeason.startDate)} - ${formatDate(
                      currentSeason.endDate
                    )}`
                  : "Standings will appear after the first leaderboard recalculation publishes a current season."}
              </p>
            </div>

            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
              <Trophy size={28} />
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
              <span>Season Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full border border-white/10 bg-zinc-900">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-300 shadow-[0_0_18px_rgba(249,115,22,0.55)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <HeroStat label="Players" value={playerCount} />
            <HeroStat
              label="Season"
              value={currentSeason ? `S${currentSeason.seasonNumber}` : "TBA"}
            />
            <HeroStat label="Reset" value="2 / Year" />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function LeaderboardPodium({ rows }: { rows: PublicLeaderboardStanding[] }) {
  if (rows.length === 0) {
    return (
      <EmptyPanel
        icon={Crown}
        title="Top 3 Current Season Podium"
        message="No public season leaders are available yet. Podium positions will appear after completed tournaments are recalculated."
      />
    );
  }

  const ordered = rows.length >= 3 ? [rows[1], rows[0], rows[2]] : rows;

  return (
    <section>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
            Current Season Leaders
          </p>
          <h2 className="mt-2 text-3xl font-black text-white">Top 3 Podium</h2>
        </div>
        <p className="max-w-2xl text-sm text-zinc-500">
          Overall bracket leaders from the active season standings.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-end">
        {ordered.map((row) => (
          <PodiumCard
            key={`${row.playerId}-${row.rank}`}
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
    <Link
      href={`/players/${row.playerId}`}
      className={`group relative block overflow-hidden rounded-3xl border p-5 shadow-2xl shadow-black/25 backdrop-blur transition hover:-translate-y-1 ${
        prominent
          ? "border-orange-300/50 bg-[linear-gradient(145deg,rgba(249,115,22,0.2),rgba(255,255,255,0.06))] lg:min-h-[380px]"
          : "border-white/10 bg-white/[0.04] lg:min-h-[330px]"
      }`}
    >
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute -top-20 right-0 h-44 w-44 rounded-full bg-orange-500/20 blur-3xl" />
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
    </Link>
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
        message="Leaderboard rows will appear here after administrators recalculate completed tournaments. Everyone starts from 0 points at go-live."
        className="mt-6"
      />
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-black/45 text-xs uppercase tracking-wider text-zinc-500">
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
          <tbody className="divide-y divide-white/10 bg-white/[0.02]">
            {rows.map((row) => (
              <tr
                key={`${scope}-${row.bracketType}-${row.playerId}`}
                className="transition hover:bg-orange-500/10"
              >
                <td className="px-4 py-4 text-lg font-black text-orange-300">
                  #{row.rank ?? "-"}
                </td>
                <td className="px-4 py-4">
                  <Link
                    href={`/players/${row.playerId}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Avatar standing={row} size="small" />
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">
                        {row.playerName}
                      </p>
                      {row.region && (
                        <p className="truncate text-xs text-zinc-500">
                          {row.region}
                        </p>
                      )}
                    </div>
                  </Link>
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
  options: Array<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <div
        className={`grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 ${
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
                  ? "border border-orange-400/50 bg-orange-500/20 text-orange-100"
                  : "border border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
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
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-400">
        <CalendarDays size={16} />
        Tournament History
      </p>
      <h2 className="mt-3 text-2xl font-black text-white">
        Published Tournament Impact
      </h2>

      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-5 text-sm leading-6 text-zinc-400">
          Tournament history will appear here after leaderboard recalculations
          are published.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.slice(0, 6).map((item) => (
            <div
              key={`${item.tournamentId}-${item.bracketType}`}
              className="rounded-2xl border border-white/10 bg-black/25 p-4"
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
              <p className="mt-3 text-sm text-zinc-400">
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
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-400">
        <Award size={16} />
        Season Champions Archive
      </p>
      <h2 className="mt-3 text-2xl font-black text-white">
        Champion Records
      </h2>

      {champions.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-5 text-sm leading-6 text-zinc-400">
          Season champions will appear here when a season closes.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {champions.map((champion) => (
            <Link
              key={champion.id}
              href={`/players/${champion.playerId}`}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-orange-400/40 hover:bg-orange-500/10"
            >
              <div
                className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-orange-400/30 bg-black/45 bg-cover bg-center"
                style={
                  champion.avatarUrl
                    ? { backgroundImage: `url("${champion.avatarUrl}")` }
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
            </Link>
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
          ? { backgroundImage: `url("${standing.avatarUrl}")` }
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

function RankMovement({ row }: { row: PublicLeaderboardStanding }) {
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

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-center">
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
      className={`rounded-3xl border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-8 text-center ${className}`}
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
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

function buildTournamentHistory(rows: PublicLeaderboardStanding[]) {
  const items = new Map<string, TournamentHistoryItem>();

  for (const row of rows) {
    if (!row.lastTournamentId || !row.lastTournamentTitle) continue;

    const key = `${row.lastTournamentId}:${row.bracketType}`;
    const existing = items.get(key);
    if (existing && existing.points >= row.lastTournamentPoints) continue;

    items.set(key, {
      tournamentId: row.lastTournamentId,
      title: row.lastTournamentTitle,
      bracketType: row.bracketType,
      playerName: row.playerName,
      points: row.lastTournamentPoints,
    });
  }

  return [...items.values()].sort((left, right) => right.points - left.points);
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
    left.playerName.localeCompare(right.playerName)
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

function formatBracketLabel(bracketType: LeaderboardBracketType) {
  if (bracketType === "academy") return "Academy Bracket";
  if (bracketType === "main") return "Main / Elite Bracket";
  if (bracketType === "challenge") return "Challenge Bracket";
  return "Overall";
}
