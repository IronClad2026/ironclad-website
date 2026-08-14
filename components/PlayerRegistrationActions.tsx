"use client";

import { useActionState, useEffect, useState } from "react";
import {
  respondToWaitlistOfferAction,
  withdrawTournamentRegistrationAction,
  type PlayerRegistrationActionState,
} from "@/app/dashboard/registration-actions";
import {
  isTournamentTerminalStatus,
  type TournamentStatus,
} from "@/lib/tournaments";

type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "manual_review"
  | "waitlisted"
  | "withdrawn";

type WaitlistOfferStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | null;

const initialState: PlayerRegistrationActionState = {
  status: "idle",
  message: "",
};

export default function PlayerRegistrationActions({
  registrationId,
  registrationStatus,
  waitlistOfferStatus,
  waitlistOfferExpiresAt,
  launchedAt,
  tournamentStatus,
}: {
  registrationId: string;
  registrationStatus: RegistrationStatus;
  waitlistOfferStatus: WaitlistOfferStatus;
  waitlistOfferExpiresAt: string | null;
  launchedAt: string | null;
  tournamentStatus: TournamentStatus;
}) {
  const [withdrawState, withdrawAction, withdrawPending] = useActionState(
    withdrawTournamentRegistrationAction,
    initialState
  );
  const [offerState, offerAction, offerPending] = useActionState(
    respondToWaitlistOfferAction,
    initialState
  );
  const offerDeadline = parseTimestamp(waitlistOfferExpiresAt);
  const [offerExpired, setOfferExpired] = useState(false);
  const terminalTournament = isTournamentTerminalStatus(tournamentStatus);

  useEffect(() => {
    if (offerDeadline === null) return;

    let timeoutId = 0;
    const refreshOfferDeadline = () => {
      const millisecondsRemaining = offerDeadline - Date.now();
      if (millisecondsRemaining <= 0) {
        setOfferExpired(true);
        return;
      }

      setOfferExpired(false);
      timeoutId = window.setTimeout(
        refreshOfferDeadline,
        Math.min(millisecondsRemaining, 2_147_483_647)
      );
    };

    timeoutId = window.setTimeout(refreshOfferDeadline, 0);
    return () => window.clearTimeout(timeoutId);
  }, [offerDeadline]);

  const offerActionAvailable =
    launchedAt === null &&
    waitlistOfferStatus === "offered" &&
    !offerExpired;
  const canWithdraw =
    launchedAt === null &&
    (registrationStatus === "pending" ||
      registrationStatus === "manual_review" ||
      registrationStatus === "approved" ||
      (registrationStatus === "waitlisted" &&
        (waitlistOfferStatus === null || waitlistOfferStatus === "offered")));
  const showAcceptedStatus =
    waitlistOfferStatus === "accepted" &&
    (registrationStatus === "pending" ||
      registrationStatus === "manual_review");
  const hasOfferMessage =
    (waitlistOfferStatus !== null && waitlistOfferStatus !== "accepted") ||
    showAcceptedStatus;

  if (terminalTournament) {
    return null;
  }

  if (!canWithdraw && !hasOfferMessage) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 border border-white/10 bg-black/35 p-4">
      {waitlistOfferStatus === "offered" && (
        <div className="border border-amber-400/45 bg-amber-500/10 p-4 text-amber-100">
          <p className="text-sm font-black uppercase tracking-wider">
            A tournament place is available
          </p>
          <p className="mt-2 text-sm leading-6">
            Accept to return your registration to administrator review, or
            decline to release the place to the next eligible player.
          </p>
          {waitlistOfferExpiresAt && (
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-amber-200">
              Respond before {formatOfferDeadline(waitlistOfferExpiresAt)}
            </p>
          )}
          {offerExpired && (
            <p className="mt-3 text-sm font-bold text-red-200">
              This offer deadline has passed and the offer can no longer be
              accepted.
            </p>
          )}
        </div>
      )}

      {showAcceptedStatus && (
        <p className="text-sm font-bold text-emerald-200">
          Spot accepted — awaiting administrator review.
        </p>
      )}
      {waitlistOfferStatus === "declined" && (
        <p className="text-sm font-bold text-zinc-300">
          Spot declined. This waitlist registration is closed.
        </p>
      )}
      {waitlistOfferStatus === "expired" && (
        <p className="text-sm font-bold text-zinc-300">
          This spot offer expired. The place has moved to the next eligible
          player.
        </p>
      )}
      {waitlistOfferStatus === "cancelled" && (
        <p className="text-sm font-bold text-zinc-300">
          This division has started and its waitlist is now closed.
        </p>
      )}

      {offerActionAvailable && (
        <form action={offerAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="registrationId" value={registrationId} />
          <button
            type="submit"
            name="response"
            value="accept"
            disabled={offerPending}
            className="border border-emerald-400 bg-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {offerPending ? "Updating" : "Accept Spot"}
          </button>
          <button
            type="submit"
            name="response"
            value="decline"
            disabled={offerPending}
            className="border border-white/20 bg-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:border-red-400 hover:text-red-200 disabled:cursor-wait disabled:opacity-60"
          >
            Decline Spot
          </button>
        </form>
      )}

      {offerState.status !== "idle" && (
        <ActionMessage state={offerState} />
      )}

      {canWithdraw && (
        <form
          action={withdrawAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                "Withdraw from this tournament? This decision is final and you cannot register again for this tournament."
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="registrationId" value={registrationId} />
          <button
            type="submit"
            disabled={withdrawPending}
            className="border border-red-500/50 bg-red-950/25 px-4 py-3 text-sm font-black uppercase tracking-wider text-red-200 transition hover:border-red-400 hover:bg-red-500/15 disabled:cursor-wait disabled:opacity-60"
          >
            {withdrawPending ? "Withdrawing" : "Withdraw Registration"}
          </button>
        </form>
      )}

      {withdrawState.status !== "idle" && (
        <ActionMessage state={withdrawState} />
      )}
    </div>
  );
}

function ActionMessage({ state }: { state: PlayerRegistrationActionState }) {
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "text-sm font-bold text-red-200"
          : "text-sm font-bold text-emerald-200"
      }
    >
      {state.message}
    </p>
  );
}

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatOfferDeadline(value: string) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return "the stated deadline";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}
