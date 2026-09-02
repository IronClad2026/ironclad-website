"use client";

import { createTournamentDivisionInvitationAction } from "@/app/admin/tournaments/actions";

export type AdminDivisionInvitationRegistration = {
  id: string;
  playerName: string;
  registrationStatus: "pending" | "manual_review" | "approved" | "waitlisted";
  invitations: Array<{
    id: string;
    targetTournamentTitle: string;
    status: "pending" | "accepted" | "declined" | "invalidated";
    createdAt: string;
    invalidationReason: string | null;
  }>;
};

export type AdminDivisionInvitationTarget = {
  bracketId: string;
  tournamentId: string;
  tournamentTitle: string;
};

export default function AdminDivisionInvitationPanel({
  registrations,
  targets,
  workspaceTournamentId,
}: {
  registrations: AdminDivisionInvitationRegistration[];
  targets: AdminDivisionInvitationTarget[];
  workspaceTournamentId?: string;
}) {
  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
        Optional next-event invitations
      </p>
      <p className="mt-2 leading-6 text-zinc-300">
        Invite an eligible preserved registration to one explicit matching
        Division. No player is transferred or registered automatically;
        acceptance only opens the normal registration flow.
      </p>

      {registrations.length === 0 ? (
        <p className="mt-4 border border-white/10 bg-black/25 p-3 text-zinc-400">
          No preserved registration is currently eligible for an invitation.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {registrations.map((registration) => (
            <article
              key={registration.id}
              className="border border-white/10 bg-black/30 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-black text-white">
                    {registration.playerName}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Preserved {registration.registrationStatus.replace("_", " ")} registration
                  </p>
                </div>
                {registration.invitations[0] && (
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-300">
                    Latest: {registration.invitations[0].status}
                  </p>
                )}
              </div>

              {registration.invitations.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs leading-5 text-zinc-400">
                  {registration.invitations.map((invitation) => (
                    <li key={invitation.id}>
                      {invitation.targetTournamentTitle} — {invitation.status}
                      {invitation.invalidationReason
                        ? ` (${invitation.invalidationReason.replaceAll("_", " ")})`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}

              {targets.length > 0 ? (
                <form
                  action={createTournamentDivisionInvitationAction}
                  className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                >
                  <input
                    type="hidden"
                    name="sourceRegistrationId"
                    value={registration.id}
                  />
                  {workspaceTournamentId && (
                    <input
                      type="hidden"
                      name="workspaceTournamentId"
                      value={workspaceTournamentId}
                    />
                  )}
                  <label>
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                      Explicit target event
                    </span>
                    <select
                      name="targetTournamentBracketId"
                      required
                      defaultValue=""
                      className="mt-2 min-h-11 w-full border border-white/10 bg-zinc-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-orange-400"
                    >
                      <option value="" disabled>
                        Select one matching open Division
                      </option>
                      {targets.map((target) => (
                        <option key={target.bracketId} value={target.bracketId}>
                          {target.tournamentTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="min-h-11 bg-orange-500 px-4 py-2 text-sm font-black uppercase tracking-wider text-black transition hover:bg-orange-400"
                  >
                    Send invitation
                  </button>
                </form>
              ) : (
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                  No explicit matching Division is currently accepting registration.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
