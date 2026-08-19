"use client";

import { useActionState, useEffect, useState } from "react";
import {
  respondToWaitlistOfferAction,
  withdrawTournamentRegistrationAction,
  type PlayerRegistrationActionState,
} from "@/app/dashboard/registration-actions";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { formatDateTime } from "@/lib/i18n/format";
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
  const locale = useOptionalLocale();
  const t = useOptionalTranslations("competition", competitionEnglish);
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
            {t("registrationActions.offerTitle")}
          </p>
          <p className="mt-2 text-sm leading-6">
            {t("registrationActions.offerDescription")}
          </p>
          {waitlistOfferExpiresAt && (
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-amber-200">
              {t("registrationActions.respondBefore", {
                deadline: formatOfferDeadline(
                  waitlistOfferExpiresAt,
                  locale,
                  t("registrationActions.statedDeadline")
                ),
              })}
            </p>
          )}
          {offerExpired && (
            <p className="mt-3 text-sm font-bold text-red-200">
              {t("registrationActions.deadlinePassed")}
            </p>
          )}
        </div>
      )}

      {showAcceptedStatus && (
        <p className="text-sm font-bold text-emerald-200">
          {t("registrationActions.accepted")}
        </p>
      )}
      {waitlistOfferStatus === "declined" && (
        <p className="text-sm font-bold text-zinc-300">
          {t("registrationActions.declined")}
        </p>
      )}
      {waitlistOfferStatus === "expired" && (
        <p className="text-sm font-bold text-zinc-300">
          {t("registrationActions.expired")}
        </p>
      )}
      {waitlistOfferStatus === "cancelled" && (
        <p className="text-sm font-bold text-zinc-300">
          {t("registrationActions.cancelled")}
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
            {offerPending
              ? t("registrationActions.updating")
              : t("registrationActions.acceptSpot")}
          </button>
          <button
            type="submit"
            name="response"
            value="decline"
            disabled={offerPending}
            className="border border-white/20 bg-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:border-red-400 hover:text-red-200 disabled:cursor-wait disabled:opacity-60"
          >
            {t("registrationActions.declineSpot")}
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
                t("registrationActions.withdrawConfirm")
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
            {withdrawPending
              ? t("registrationActions.withdrawing")
              : t("registrationActions.withdraw")}
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
  const t = useOptionalTranslations("competition", competitionEnglish);
  const paths = {
    auth_required: "actionResults.authRequired",
    invalid_registration: "actionResults.invalidRegistration",
    verification_failed: "actionResults.verificationFailed",
    registration_unavailable: "actionResults.registrationUnavailable",
    division_started: "actionResults.divisionStarted",
    offer_expired: "actionResults.offerExpired",
    offer_unavailable: "actionResults.offerUnavailable",
    withdrawal_unavailable: "actionResults.withdrawalUnavailable",
    mutation_failed: "actionResults.mutationFailed",
    withdrawn: "actionResults.withdrawn",
    offer_accepted: "actionResults.offerAccepted",
    offer_declined: "actionResults.offerDeclined",
  } as const;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "text-sm font-bold text-red-200"
          : "text-sm font-bold text-emerald-200"
      }
    >
      {state.code ? t(paths[state.code]) : state.message}
    </p>
  );
}

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatOfferDeadline(
  value: string,
  locale: Parameters<typeof formatDateTime>[1],
  fallback: string
) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return fallback;

  return formatDateTime(timestamp, locale, { kind: "local" });
}
