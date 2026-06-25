"use client";

import { useActionState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Trophy,
  XCircle,
} from "lucide-react";
import {
  runLeaderboardRecalculation,
  type LeaderboardRecalculationActionState,
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

export default function AdminLeaderboardControls({
  completedTournaments,
  recentRuns,
  className = "",
}: AdminLeaderboardControlsProps) {
  const [state, formAction, pending] = useActionState(
    runLeaderboardRecalculation,
    initialState
  );
  const hasCompletedTournaments = completedTournaments.length > 0;

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

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-300">
            Recent Recalculation Runs
          </p>
          <Clock3 className="h-4 w-4 text-zinc-500" />
        </div>

        {recentRuns.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No leaderboard recalculation runs have been recorded yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {getRunTitle(run)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Started {formatDateTime(run.startedAt)}
                      {run.finishedAt
                        ? ` - Finished ${formatDateTime(run.finishedAt)}`
                        : ""}
                    </p>
                  </div>

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
                </div>

                {run.notes && (
                  <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2 text-xs leading-5 text-zinc-400">
                    {run.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
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
