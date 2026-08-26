import { AlertTriangle, LockKeyhole } from "lucide-react";
import DeleteTournamentControl, {
  type TournamentDeletionPreview,
} from "@/components/DeleteTournamentControl";
import TournamentRecoveryControl from "@/components/TournamentRecoveryControl";
import type { AdminTournamentWorkspaceRow } from "@/lib/admin-tournament-workspace";
import { isTournamentTerminalStatus } from "@/lib/tournaments";

export default function TournamentControls({
  deletionPreview,
  tournament,
  underReview,
}: {
  deletionPreview: TournamentDeletionPreview;
  tournament: AdminTournamentWorkspaceRow;
  underReview: {
    seasonName: string;
    at: string | null;
    reason: string | null;
    triggeringTournamentTitle: string;
  } | null;
}) {
  const terminal = isTournamentTerminalStatus(tournament.status);

  return (
    <section aria-labelledby="tournament-controls-title" className="min-w-0">
      <div className="rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-red-300"
            size={22}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              High-impact operations
            </p>
            <h2
              id="tournament-controls-title"
              className="mt-2 break-words text-2xl font-black text-white"
            >
              Tournament Controls
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Cancel, Void, and hard Delete remain separated from everyday
              management. Existing authorization, lifecycle guards, database
              checks, confirmation tokens, and audit behavior are unchanged.
            </p>
          </div>
        </div>
      </div>

      <TournamentRecoveryControl
        tournamentId={tournament.id}
        tournamentTitle={tournament.title}
        terminal={
          terminal
            ? {
                status:
                  tournament.status === "cancelled" ? "cancelled" : "voided",
                at: tournament.terminal_at,
                reason: tournament.terminal_reason,
              }
            : null
        }
        underReview={underReview}
      />

      <section className="mt-6 min-w-0 rounded-3xl border border-red-500/30 bg-red-950/15 p-4 sm:p-6 md:p-8">
        <div className="flex min-w-0 items-start gap-3">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-red-300"
            size={21}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              Destructive action
            </p>
            <h3 className="mt-2 break-words text-xl font-black text-white">
              Hard Delete Tournament
            </h3>
          </div>
        </div>

        {terminal ? (
          <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-950/20 p-4 text-sm leading-6 text-amber-100">
            Hard Delete is unavailable for a terminal Tournament. Historical
            competition records remain preserved by the existing lifecycle
            safeguards.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              This opens the existing protected deletion preview and requires
              the exact confirmation token. The database remains authoritative
              about whether deletion is permitted.
            </p>
            <div className="mt-5 max-w-sm">
              <DeleteTournamentControl
                tournamentId={tournament.id}
                tournamentTitle={tournament.title}
                preview={deletionPreview}
                variant="standalone"
              />
            </div>
          </>
        )}
      </section>

      <p className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-500">
        Tournament completion, finalization, and archive behavior continues to
        be managed automatically by the existing match lifecycle. No new manual
        archive state or action is introduced here.
      </p>
    </section>
  );
}
