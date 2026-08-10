"use client";

import { useActionState, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  extendTournamentMatchDeadline,
  holdTournamentMatchDeadline,
  releaseTournamentMatchDeadline,
  type MatchDeadlineActionState,
} from "@/app/admin/tournaments/deadline-actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import type { GeneratedTournamentMatch } from "@/lib/tournaments";

const initialState: MatchDeadlineActionState = {
  status: "idle",
  message: "",
};

export default function AdminMatchDeadlineControls({
  match,
}: {
  match: GeneratedTournamentMatch;
}) {
  const [extensionState, extensionAction, extensionPending] = useActionState(
    extendTournamentMatchDeadline,
    initialState
  );
  const [holdState, holdAction, holdPending] = useActionState(
    holdTournamentMatchDeadline,
    initialState
  );
  const [releaseState, releaseAction, releasePending] = useActionState(
    releaseTournamentMatchDeadline,
    initialState
  );
  const [now, setNow] = useState<number | null>(null);
  const holdActive = Boolean(match.holdStartedAt && !match.holdReleasedAt);
  const extensionAppliesToCurrentActivation = timestampFallsInActivation(
    match.extendedAt,
    match.activatedAt
  );
  const holdBelongsToCurrentActivation = timestampFallsInActivation(
    match.holdStartedAt,
    match.activatedAt
  );
  const deadlinePassed =
    match.deadlineAt && now !== null
      ? now >= new Date(match.deadlineAt).getTime()
      : false;
  const isActive = match.status === "in_progress" && Boolean(match.deadlineAt);
  const canExtend =
    isActive &&
    now !== null &&
    !deadlinePassed &&
    !holdActive &&
    match.extendedAt === null;
  const canStartHold =
    isActive &&
    now !== null &&
    !deadlinePassed &&
    !holdActive &&
    match.holdStartedAt === null;

  useEffect(() => {
    if (!isActive || holdActive) return;

    const updateNow = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [holdActive, isActive]);

  return (
    <section className="border border-orange-400/20 bg-orange-500/[0.04] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-orange-300">
            Match Deadline
          </p>
          <p className="mt-2 text-sm font-black text-white">
            {formatDeadlineState(match)}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Activation {match.activationVersion || "Not started"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <DeadlineValue
          label="Activated"
          value={
            <HydrationSafeLocalDateTime
              value={match.activatedAt}
              fallback="Not activated"
            />
          }
        />
        <DeadlineValue
          label="Effective deadline"
          value={
            <HydrationSafeLocalDateTime
              value={match.deadlineAt}
              fallback="Not started"
            />
          }
        />
        <DeadlineValue
          label="Reminder one (72h)"
          value={
            <HydrationSafeLocalDateTime
              value={match.reminderOneSentAt}
              fallback="Not sent"
            />
          }
        />
        <DeadlineValue
          label="Reminder two (24h)"
          value={
            <HydrationSafeLocalDateTime
              value={match.reminderTwoSentAt}
              fallback="Not sent"
            />
          }
        />
        <DeadlineValue
          label="Extension"
          value={
            match.extensionMinutes
              ? extensionAppliesToCurrentActivation
                ? (
                    <>
                      {formatDuration(match.extensionMinutes)} added to this
                      activation{" "}
                      <HydrationSafeLocalDateTime
                        value={match.extendedAt}
                        fallback=""
                      />
                    </>
                  )
                : `${formatDuration(match.extensionMinutes)} lifetime allowance used on a previous activation`
              : "Unused"
          }
        />
        <DeadlineValue
          label="Administrative hold"
          value={
            holdActive
              ? (
                  <>
                    Active since{" "}
                    <HydrationSafeLocalDateTime
                      value={match.holdStartedAt}
                      fallback=""
                    />
                  </>
                )
              : match.holdStartedAt
                ? holdBelongsToCurrentActivation
                  ? (
                      <>
                        Used this activation; released{" "}
                        <HydrationSafeLocalDateTime
                          value={match.holdReleasedAt}
                          fallback=""
                        />
                      </>
                    )
                  : "Lifetime allowance used on a previous activation"
                : "Unused"
          }
        />
      </div>

      {match.extensionReason && (
        <AuditReason label="Extension reason" reason={match.extensionReason} />
      )}
      {match.holdReason && (
        <AuditReason label="Hold reason" reason={match.holdReason} />
      )}

      {canExtend && (
        <form action={extensionAction} className="mt-5 space-y-3 border-t border-white/10 pt-5">
          <input type="hidden" name="matchId" value={match.id} />
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="block text-xs font-bold text-zinc-300">
              Extension minutes
              <input
                name="extensionMinutes"
                type="number"
                min={1}
                max={2_880}
                step={1}
                required
                defaultValue={1_440}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
              />
            </label>
            <label className="block text-xs font-bold text-zinc-300">
              Administrator reason
              <textarea
                name="reason"
                rows={2}
                maxLength={2_000}
                required
                className="mt-2 min-h-11 w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
              />
            </label>
          </div>
          <ActionMessage state={extensionState} />
          <button
            type="submit"
            disabled={extensionPending}
            className="min-h-11 w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50 sm:w-auto"
          >
            {extensionPending ? "Extending..." : "Apply One-Time Extension"}
          </button>
        </form>
      )}

      {canStartHold && (
        <form action={holdAction} className="mt-5 space-y-3 border-t border-white/10 pt-5">
          <input type="hidden" name="matchId" value={match.id} />
          <label className="block text-xs font-bold text-zinc-300">
            Exceptional hold reason
            <textarea
              name="reason"
              rows={2}
              maxLength={2_000}
              required
              className="mt-2 min-h-11 w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
            />
          </label>
          <ActionMessage state={holdState} />
          <button
            type="submit"
            disabled={holdPending}
            className="min-h-11 w-full rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50 sm:w-auto"
          >
            {holdPending ? "Pausing..." : "Place Match On Hold"}
          </button>
        </form>
      )}

      {holdActive && (
        <form action={releaseAction} className="mt-5 border-t border-white/10 pt-5">
          <input type="hidden" name="matchId" value={match.id} />
          <ActionMessage state={releaseState} />
          <button
            type="submit"
            disabled={releasePending}
            className="mt-3 min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
          >
            {releasePending ? "Resuming..." : "Release Hold & Resume Deadline"}
          </button>
        </form>
      )}

      {!isActive && !match.outcomeType && (
        <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-zinc-500">
          Deadline controls become available only while a real two-player
          matchup is active. Pending result and adjudication workflows remain
          protected through their existing controls.
        </p>
      )}
    </section>
  );
}

function DeadlineValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-white">{value}</p>
    </div>
  );
}

function AuditReason({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">
        {reason}
      </p>
    </div>
  );
}

function ActionMessage({ state }: { state: MatchDeadlineActionState }) {
  if (state.status === "idle") return null;

  return (
    <p
      aria-live="polite"
      className={`rounded-lg border p-3 text-xs ${
        state.status === "success"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-400/30 bg-red-500/10 text-red-200"
      }`}
    >
      {state.message}
    </p>
  );
}

function formatDeadlineState(match: GeneratedTournamentMatch) {
  const normalizedRoundName = match.roundName.trim().toLowerCase();
  const isFinal =
    normalizedRoundName === "final" || normalizedRoundName === "grand final";

  if (match.outcomeType === "deadline_double_forfeit") {
    return isFinal
      ? "Final double forfeit — completed without a champion"
      : `${match.roundName} double forfeit — no player advanced`;
  }
  if (match.outcomeType === "automatic_bye") {
    return isFinal
      ? "Final walkover — champion advanced without a played match"
      : `${match.roundName} automatic bye — no match was played`;
  }
  if (match.outcomeType === "empty_feeder") {
    return isFinal
      ? "Final closed — completed without a champion"
      : `${match.roundName} closed — no eligible player advanced`;
  }
  if (match.holdStartedAt && !match.holdReleasedAt) {
    return "Paused by administrator";
  }
  if (match.status === "pending_review") {
    return "Protected while result or ruling is reviewed";
  }
  if (match.status === "in_progress") {
    return "Active matchup";
  }
  if (match.status === "completed") return "Completed";
  return match.playerOneRegistrationId || match.playerTwoRegistrationId
    ? "Waiting for opponent"
    : "Not activated";
}

function formatDuration(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours)
    ? `${hours} hour${hours === 1 ? "" : "s"}`
    : `${minutes} minutes`;
}

function timestampFallsInActivation(
  eventAt: string | null,
  activatedAt: string | null
) {
  if (!eventAt || !activatedAt) return false;

  const eventTimestamp = new Date(eventAt).getTime();
  const activationTimestamp = new Date(activatedAt).getTime();
  return (
    Number.isFinite(eventTimestamp) &&
    Number.isFinite(activationTimestamp) &&
    eventTimestamp >= activationTimestamp
  );
}
