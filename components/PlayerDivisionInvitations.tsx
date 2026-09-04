"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  respondToTournamentDivisionInvitationAction,
  type PlayerDivisionInvitationActionState,
} from "@/app/dashboard/registration-actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
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
  return (
    <section id="division-invitations" className="mt-8 scroll-mt-28">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
        Tournament invitations
      </p>
      <h2 className="mt-3 text-3xl font-bold text-white">
        Optional next-event invitations
      </h2>
      <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
        An invitation does not transfer or register you. Accepting opens the
        existing registration flow, where current profile, consent, Steam,
        Relic ELO, Division capacity, and waitlist checks still apply.
      </p>

      {loadError ? (
        <p role="alert" className="mt-5 border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
          Tournament invitations could not be loaded. Refresh and try again.
        </p>
      ) : invitations.length === 0 ? (
        <p className="mt-5 border border-dashed border-white/10 bg-black/30 p-4 text-sm text-zinc-500">
          No Tournament Division invitations are available.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {invitations.map((invitation) => (
            <InvitationCard key={invitation.id} invitation={invitation} />
          ))}
        </div>
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
    <article className="border border-orange-500/20 bg-black/65 p-5 shadow-2xl shadow-black/25">
      <p className="text-xs font-black uppercase tracking-wider text-orange-300">
        {invitation.status === "pending" ? "Response requested" : invitation.status}
      </p>
      <h3 className="mt-2 text-xl font-black text-white">
        {invitation.targetTournamentTitle}
      </h3>
      <p className="mt-1 font-bold text-zinc-300">
        {invitation.targetDivisionName} Division
      </p>
      <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">
        Invited{" "}
        <HydrationSafeLocalDateTime
          value={invitation.createdAt}
          fallback="date unavailable"
        />
      </p>

      {invitation.status === "pending" && (
        <form action={action} className="mt-5 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="invitationId" value={invitation.id} />
          <button
            type="submit"
            name="response"
            value="accept"
            disabled={pending}
            className="min-h-11 bg-orange-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:bg-orange-400 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Updating…" : "Accept and continue"}
          </button>
          <button
            type="submit"
            name="response"
            value="decline"
            disabled={pending}
            className="min-h-11 border border-white/20 bg-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:border-red-400 hover:text-red-200 disabled:cursor-wait disabled:opacity-60"
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
