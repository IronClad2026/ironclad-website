"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  respondToTournamentDivisionInvitationAction,
  type PlayerDivisionInvitationActionState,
} from "@/app/dashboard/registration-actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import type { PlayerTournamentDivisionInvitation } from "@/lib/tournament-division-invitations";

const initialState: PlayerDivisionInvitationActionState = {
  status: "idle",
  message: "",
};

export default function PlayerDivisionInvitations({
  invitations,
  loadError,
}: {
  invitations: PlayerTournamentDivisionInvitation[];
  loadError: boolean;
}) {
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);
  const current = invitations.filter((invitation) =>
    invitation.status === "pending" || invitation.status === "accepted"
  );
  const previous = invitations.filter((invitation) =>
    invitation.status === "declined" || invitation.status === "invalidated"
  );
  return (
    <section
      id="division-invitations"
      className="mt-5 min-w-0 scroll-mt-28"
      data-dashboard-section="division-invitations"
      aria-labelledby="division-invitations-title"
    >
      <h3 id="division-invitations-title" className="text-base font-bold text-zinc-200">
        {t("dashboard.competition.invitations")}
      </h3>
      {loadError ? (
        <p role="alert" className="mt-3 border-l-2 border-red-400 bg-red-500/10 p-3 text-sm text-red-200">
          Tournament invitations could not be loaded. Refresh and try again.
        </p>
      ) : (
        <>
          {current.length > 0 ? (
            <>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{t("dashboard.competition.invitationHelp")}</p>
              <div className="mt-3 grid gap-3">
                {current.map((invitation) => <InvitationCard key={invitation.id} invitation={invitation} />)}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">{t("dashboard.competition.noInvitations")}</p>
          )}
          {previous.length > 0 && (
            <details className="mt-3 border-t border-white/10">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">
                {t("dashboard.competition.previousInvitations")} ({previous.length})
              </summary>
              <div className="grid gap-3">
                {previous.map((invitation) => <InvitationCard key={invitation.id} invitation={invitation} />)}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function InvitationCard({
  invitation,
}: {
  invitation: PlayerTournamentDivisionInvitation;
}) {
  const [state, action, pending] = useActionState(
    respondToTournamentDivisionInvitationAction,
    initialState
  );

  return (
    <article className="min-w-0 border border-white/12 bg-zinc-950/80 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-wider text-orange-300">
        {invitation.status === "pending" ? "Response requested" : invitation.status}
      </p>
      <h3 className="mt-1.5 break-words text-lg font-black text-white">
        {invitation.targetTournamentTitle}
      </h3>
      <p className="mt-1 text-sm font-semibold text-zinc-300">
        {invitation.targetDivisionName} Division
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        Invited{" "}
        <HydrationSafeLocalDateTime
          value={invitation.createdAt}
          fallback="date unavailable"
        />
      </p>

      {invitation.status === "pending" && (
        <form action={action} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="invitationId" value={invitation.id} />
          <button
            type="submit"
            name="response"
            value="accept"
            disabled={pending}
            className="min-h-11 bg-orange-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Updating…" : "Accept and continue"}
          </button>
          <button
            type="submit"
            name="response"
            value="decline"
            disabled={pending}
            className="min-h-11 border border-white/20 bg-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:border-red-400 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60"
          >
            Decline
          </button>
        </form>
      )}

      {invitation.status === "accepted" && (
        <div className="mt-4">
          <p className="text-sm font-bold text-emerald-200">
            Accepted. Complete the normal registration flow to join the event.
          </p>
          <Link
            href={`/tournaments?tournament=${encodeURIComponent(invitation.targetTournamentSlug)}&register=1`}
            className="mt-3 inline-flex min-h-11 items-center border border-emerald-400/40 px-4 py-2 text-sm font-black uppercase tracking-wider text-emerald-100 transition hover:border-emerald-300 hover:text-white"
          >
            Continue registration
          </Link>
        </div>
      )}
      {invitation.status === "declined" && (
        <p className="mt-4 text-sm font-bold text-zinc-300">
          Declined. No registration was created.
        </p>
      )}
      {invitation.status === "invalidated" && (
        <p className="mt-4 text-sm font-bold text-zinc-400">
          This invitation is no longer available.
        </p>
      )}
      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`mt-4 text-sm font-bold ${
            state.status === "error" ? "text-red-200" : "text-emerald-200"
          }`}
        >
          {state.message}
        </p>
      )}
    </article>
  );
}
