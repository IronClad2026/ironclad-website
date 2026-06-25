"use client";

import {
  type FormEvent,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  RefreshCw,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react";
import {
  deleteLeaderboardRecalculationRunRecords,
  runLeaderboardRecalculation,
  type LeaderboardRecalculationActionState,
  type LeaderboardRunDeleteActionState,
} from "@/app/admin/leaderboard-actions";
import type {
  LeaderboardCompletedTournament,
  LeaderboardRecalculationRun,
} from "@/lib/leaderboard/admin";

type AdminLeaderboardControlsProps = {
  completedTournaments: LeaderboardCompletedTournament[];
  recentRuns: LeaderboardRecalculationRun[];
  className?: string;
};

const initialState: LeaderboardRecalculationActionState = {
  status: "idle",
  message: "",
};

const initialDeleteState: LeaderboardRunDeleteActionState = {
  status: "idle",
  message: "",
};

export default function AdminLeaderboardControls({
  completedTournaments,
  recentRuns,
  className = "",
}: AdminLeaderboardControlsProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    runLeaderboardRecalculation,
    initialState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLeaderboardRecalculationRunRecords,
    initialDeleteState
  );
  const [runsOpen, setRunsOpen] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(
    () => new Set()
  );
  const hasCompletedTournaments = completedTournaments.length > 0;
  const deletedRunIdSet = useMemo(
    () =>
      deleteState.status === "success"
        ? new Set(deleteState.deletedRunIds ?? [])
        : new Set<string>(),
    [deleteState.status, deleteState.deletedRunIds]
  );
  const displayedRuns = useMemo(
    () => recentRuns.filter((run) => !deletedRunIdSet.has(run.id)),
    [recentRuns, deletedRunIdSet]
  );
  const visibleRunIds = useMemo(
    () => displayedRuns.map((run) => run.id),
    [displayedRuns]
  );
  const visibleRunIdSet = useMemo(
    () => new Set(visibleRunIds),
    [visibleRunIds]
  );
  const selectedVisibleRunIds = useMemo(
    () => [...selectedRunIds].filter((runId) => visibleRunIdSet.has(runId)),
    [selectedRunIds, visibleRunIdSet]
  );
  const recentRunGroups = useMemo(
    () => groupRecentRuns(displayedRuns),
    [displayedRuns]
  );
  const latestRun = displayedRuns[0] ?? null;
  const selectedCount = selectedVisibleRunIds.length;
  const allVisibleSelected =
    visibleRunIds.length > 0 &&
    visibleRunIds.every((runId) => selectedRunIds.has(runId));

  useEffect(() => {
    if (deleteState.status === "success") {
      router.refresh();
    }
  }, [deleteState.status, deleteState.deletedRunIds, router]);

  const toggleRunSelection = (runId: string, selected: boolean) => {
    setSelectedRunIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(runId);
      } else {
        next.delete(runId);
      }

      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedRunIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleRunIds.forEach((runId) => next.delete(runId));
      } else {
        visibleRunIds.forEach((runId) => next.add(runId));
      }

      return next;
    });
  };

  const confirmRunDeletion = (
    event: FormEvent<HTMLFormElement>,
    runCount: number
  ) => {
    if (runCount === 0) {
      event.preventDefault();
      return;
    }

    const plural = runCount === 1 ? "record" : "records";
    const confirmed = window.confirm(
      `Delete ${runCount} recalculation run ${plural}? This removes only audit records from leaderboard_recalculation_runs and does not stop any active recalculation.`
    );

    if (!confirmed) {
      event.preventDefault();
      return;
    }
  };

  return (
    <section
      className={`rounded-3xl border border-orange-500/20 bg-[linear-gradient(135deg,rgba(249,115,22,0.08),rgba(255,255,255,0.035))] p-6 shadow-xl shadow-black/20 backdrop-blur ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
            Leaderboard & Ranking
          </p>
          <h2 className="mt-2 flex items-center gap-3 text-2xl font-black text-white">
            <BarChart3 className="h-6 w-6 text-orange-400" />
            Leaderboard Controls
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Manually rebuild leaderboard events and cached rankings after
            completed tournaments or approved administrative adjustments.
          </p>
        </div>

        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
          Admin Only
        </span>
      </div>

      <form action={formAction} className="mt-6 grid gap-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <button
            type="submit"
            name="leaderboardAction"
            value="current_season"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300/60 hover:bg-orange-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Recalculating..." : "Recalculate Current Season"}
          </button>

          <button
            type="submit"
            name="leaderboardAction"
            value="all_time"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black uppercase tracking-wider text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            <Trophy className="h-4 w-4" />
            {pending ? "Recalculating..." : "Recalculate All-Time Ranking"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <label
            htmlFor="leaderboardTournamentId"
            className="text-xs font-black uppercase tracking-wider text-zinc-300"
          >
            Completed Tournament
          </label>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
            <select
              id="leaderboardTournamentId"
              name="tournamentId"
              disabled={pending || !hasCompletedTournaments}
              className="min-h-12 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              defaultValue={completedTournaments[0]?.id ?? ""}
            >
              {hasCompletedTournaments ? (
                completedTournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.title}
                    {tournament.date ? ` - ${formatDate(tournament.date)}` : ""}
                  </option>
                ))
              ) : (
                <option value="">No completed tournaments available</option>
              )}
            </select>

            <button
              type="submit"
              name="leaderboardAction"
              value="tournament"
              disabled={pending || !hasCompletedTournaments}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-100 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
              />
              Recalculate Selected Tournament
            </button>
          </div>
        </div>

        {state.status !== "idle" && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-2xl border p-4 text-sm font-semibold leading-6 ${
              state.status === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : state.status === "pending"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                  : "border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {state.message}
          </div>
        )}
      </form>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20">
        <button
          type="button"
          onClick={() => setRunsOpen((current) => !current)}
          aria-expanded={runsOpen}
          className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-300">
              Recent Recalculation Runs
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {displayedRuns.length === 0
                ? "No runs recorded yet."
                : `${displayedRuns.length} recent run${
                    displayedRuns.length === 1 ? "" : "s"
                  }${latestRun ? ` - latest ${latestRun.status}` : ""}.`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {latestRun && <RunStatusPill run={latestRun} />}
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition ${
                runsOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {runsOpen && (
          <div className="border-t border-white/10 p-4">
            {displayedRuns.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Recalculation history will appear here after administrators run
                a rebuild.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-300">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      disabled={deletePending || visibleRunIds.length === 0}
                      className="h-4 w-4 rounded border-white/20 bg-black/40 accent-orange-500 disabled:cursor-not-allowed"
                    />
                    Select All
                    <span className="text-zinc-500">
                      ({selectedCount} selected)
                    </span>
                  </label>

                  <form
                    action={deleteAction}
                    onSubmit={(event) =>
                      confirmRunDeletion(event, selectedCount)
                    }
                    className="flex flex-wrap items-center gap-3"
                  >
                    {selectedVisibleRunIds.map((runId) => (
                      <input
                        key={runId}
                        type="hidden"
                        name="runId"
                        value={runId}
                      />
                    ))}
                    <button
                      type="submit"
                      disabled={deletePending || selectedCount === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-100 transition hover:border-red-300/60 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletePending ? "Deleting..." : "Delete Selected Records"}
                    </button>
                  </form>
                </div>

                {deleteState.status !== "idle" && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${
                      deleteState.status === "success"
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                        : "border-red-400/30 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {deleteState.message}
                  </div>
                )}

                <div className="mt-4 max-h-[28rem] space-y-4 overflow-y-auto pr-1">
                  {recentRunGroups.map((group) => (
                    <div
                      key={group.key}
                      className="rounded-xl border border-white/10 bg-white/[0.025] p-3"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                        Tournament
                      </p>
                      <h3 className="mt-1 text-sm font-black text-white">
                        {group.tournamentLabel}
                      </h3>

                      <div className="mt-3 space-y-3">
                        {group.modes.map((mode) => (
                          <div
                            key={mode.key}
                            className="rounded-lg border border-white/10 bg-black/25 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-black uppercase tracking-wider text-zinc-300">
                                Mode: {mode.modeLabel}
                              </p>
                              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                {mode.runs.length} run
                                {mode.runs.length === 1 ? "" : "s"}
                              </span>
                            </div>

                            <div className="mt-3 space-y-2">
                              {mode.runs.map((run) => (
                                <div
                                  key={run.id}
                                  className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                      <input
                                        type="checkbox"
                                        checked={selectedRunIds.has(run.id)}
                                        onChange={(event) =>
                                          toggleRunSelection(
                                            run.id,
                                            event.target.checked
                                          )
                                        }
                                        disabled={deletePending}
                                        aria-label={`Select ${getRunTitle(run)}`}
                                        className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 accent-orange-500 disabled:cursor-not-allowed"
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-bold text-white">
                                          {getRunTitle(run)}
                                        </span>
                                        <span className="mt-1 block text-xs text-zinc-500">
                                          Started {formatDateTime(run.startedAt)}
                                          {run.finishedAt
                                            ? ` - Finished ${formatDateTime(
                                                run.finishedAt
                                              )}`
                                            : ""}
                                        </span>
                                      </span>
                                    </label>

                                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                                      <RunStatusPill run={run} />
                                      <form
                                        action={deleteAction}
                                        onSubmit={(event) =>
                                          confirmRunDeletion(event, 1)
                                        }
                                      >
                                        <button
                                          type="submit"
                                          name="runId"
                                          value={run.id}
                                          disabled={deletePending}
                                          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-100 transition hover:border-red-300/60 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          {run.status === "pending"
                                            ? "Delete Record"
                                            : "Delete"}
                                        </button>
                                      </form>
                                    </div>
                                  </div>

                                  {run.notes && (
                                    <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2 text-xs leading-5 text-zinc-400">
                                      {run.notes}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RunStatusPill({ run }: { run: LeaderboardRecalculationRun }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${getStatusClass(
        run.status
      )}`}
    >
      {run.status === "completed" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : run.status === "failed" ? (
        <XCircle className="h-3.5 w-3.5" />
      ) : (
        <Clock3 className="h-3.5 w-3.5" />
      )}
      {run.status}
    </span>
  );
}

function groupRecentRuns(runs: LeaderboardRecalculationRun[]) {
  const groups = new Map<
    string,
    {
      key: string;
      tournamentLabel: string;
      modes: Map<
        string,
        {
          key: string;
          modeLabel: string;
          runs: LeaderboardRecalculationRun[];
        }
      >;
    }
  >();

  for (const run of runs) {
    const tournamentKey = getRunTournamentKey(run);
    const tournamentLabel = getRunTournamentLabel(run);
    const modeKey = getRunModeKey(run);
    const modeLabel = getRunModeLabel(run);
    let group = groups.get(tournamentKey);

    if (!group) {
      group = {
        key: tournamentKey,
        tournamentLabel,
        modes: new Map(),
      };
      groups.set(tournamentKey, group);
    }

    const mode = group.modes.get(modeKey) ?? {
      key: modeKey,
      modeLabel,
      runs: [],
    };
    mode.runs.push(run);
    group.modes.set(modeKey, mode);
  }

  return Array.from(groups.values()).map((group) => ({
    key: group.key,
    tournamentLabel: group.tournamentLabel,
    modes: Array.from(group.modes.values()),
  }));
}

function getRunTournamentKey(run: LeaderboardRecalculationRun) {
  if (run.scope === "tournament") {
    return `tournament:${run.tournamentId ?? run.tournamentTitle ?? "unknown"}`;
  }

  return "all-tournaments";
}

function getRunModeKey(run: LeaderboardRecalculationRun) {
  if (run.scope === "season") {
    return `season:${run.seasonId ?? run.seasonName ?? "unknown"}`;
  }

  return run.scope;
}

function getRunTournamentLabel(run: LeaderboardRecalculationRun) {
  if (run.scope === "tournament") {
    return run.tournamentTitle ?? "Unknown tournament";
  }

  return "All tournaments";
}

function getRunModeLabel(run: LeaderboardRecalculationRun) {
  if (run.scope === "tournament") {
    return "Tournament";
  }

  if (run.scope === "season") {
    return run.seasonName ? `Season - ${run.seasonName}` : "Season";
  }

  return "All-time";
}

function getRunTitle(run: LeaderboardRecalculationRun) {
  if (run.scope === "tournament") {
    return run.tournamentTitle
      ? `Tournament: ${run.tournamentTitle}`
      : "Tournament recalculation";
  }

  if (run.scope === "season") {
    return run.seasonName ? `Season: ${run.seasonName}` : "Season recalculation";
  }

  return "All-time recalculation";
}

function getStatusClass(status: LeaderboardRecalculationRun["status"]) {
  if (status === "completed") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }

  if (status === "failed") {
    return "border-red-400/30 bg-red-500/10 text-red-200";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-200";
}

function formatDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Date TBA";
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
