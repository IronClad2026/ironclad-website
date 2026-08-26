"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CircleAlert, Swords } from "lucide-react";
import {
  AdminMatchManagementModal,
  type TournamentViewerRegistration,
} from "@/components/TournamentsExperience";
import {
  isTournamentTerminalStatus,
  type GeneratedTournamentBracket,
  type GeneratedTournamentMatch,
  type MatchResultReportGroup,
  type MatchResultSubmission,
  type TournamentCard,
  type TournamentParticipant,
} from "@/lib/tournaments";

export type AdminTournamentMatchesViewer = {
  isAdmin: boolean;
  relicVerifiedDivision: "Academy" | "Challenge" | "Main / Pro" | null;
  registrationIds: string[];
  registrations: TournamentViewerRegistration[];
};

export type AdminTournamentMatchesProps = {
  tournament: TournamentCard | null;
  viewer: AdminTournamentMatchesViewer | null;
  submissions?: MatchResultSubmission[];
  reportGroups?: MatchResultReportGroup[];
  loadError?: boolean;
};

type SelectedMatch = {
  match: GeneratedTournamentMatch;
  bracketFormat: GeneratedTournamentBracket["format"];
};

export default function AdminTournamentMatches({
  tournament,
  viewer,
  submissions = [],
  reportGroups = [],
  loadError = false,
}: AdminTournamentMatchesProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const participantsById = useMemo(
    () => buildParticipantsById(tournament),
    [tournament]
  );
  const generatedBrackets = useMemo(
    () => sortGeneratedBrackets(tournament),
    [tournament]
  );
  const selectedMatch = useMemo(
    () => findSelectedMatch(generatedBrackets, selectedMatchId),
    [generatedBrackets, selectedMatchId]
  );

  if (loadError) {
    return (
      <section
        role="alert"
        className="min-w-0 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-100 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 shrink-0 text-red-300" size={20} />
          <div className="min-w-0">
            <h2 className="font-black">Matches / Results unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-red-100/80">
              Tournament match data could not be loaded. Refresh the workspace
              before taking any administrative action.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!tournament || !viewer?.isAdmin) {
    return (
      <section
        role="status"
        className="min-w-0 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm leading-6 text-zinc-400"
      >
        Select an available Tournament to load its match-management workspace.
      </section>
    );
  }

  const matchCount = generatedBrackets.reduce(
    (total, bracket) => total + bracket.matches.length,
    0
  );
  const readOnly = isTournamentTerminalStatus(tournament.statusValue);

  return (
    <section className="min-w-0" aria-labelledby="admin-matches-title">
      <div className="flex min-w-0 flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-400">
            Competition operations
          </p>
          <h2
            id="admin-matches-title"
            className="mt-2 break-words text-2xl font-black text-white sm:text-3xl"
          >
            Matches / Results
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Select a match to use the existing result, replay, dispute,
            no-show, deadline, hold, extension, correction, and reset controls.
          </p>
        </div>
        <p className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">
          {matchCount} match{matchCount === 1 ? "" : "es"}
        </p>
      </div>

      {generatedBrackets.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black/25 p-7 text-center sm:p-10">
          <Swords className="mx-auto text-zinc-600" size={28} />
          <h3 className="mt-4 font-black text-white">
            No generated brackets yet
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
            Generate a private Division bracket from the existing Bracket
            workspace. Matches will appear here without changing the
            Tournament engine.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-5">
          {generatedBrackets.map((bracket) => {
            const bracketName =
              tournament.brackets.find(
                (candidate) => candidate.id === bracket.tournamentBracketId
              )?.name ?? "Tournament Bracket";

            return (
              <article
                key={bracket.id}
                className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"
              >
                <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-black text-white">
                      {bracketName}
                    </h3>
                    <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
                      {formatBracketFormat(bracket.format)} · {bracket.matches.length}{" "}
                      match{bracket.matches.length === 1 ? "" : "es"}
                    </p>
                  </div>
                  {readOnly && (
                    <span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-zinc-300">
                      Read-only history
                    </span>
                  )}
                </header>

                {bracket.matches.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">
                    This generated bracket currently contains no matches.
                  </p>
                ) : (
                  <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {bracket.matches.map((match) => (
                      <MatchButton
                        key={match.id}
                        match={match}
                        participantsById={participantsById}
                        readOnly={readOnly}
                        onSelect={() => setSelectedMatchId(match.id)}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedMatch && (
        <AdminMatchManagementModal
          tournament={tournament}
          match={selectedMatch.match}
          bracketFormat={selectedMatch.bracketFormat}
          participantsById={participantsById}
          viewer={viewer}
          submissions={submissions.filter(
            (submission) => submission.matchId === selectedMatch.match.id
          )}
          reportGroups={reportGroups.filter(
            (reportGroup) => reportGroup.matchId === selectedMatch.match.id
          )}
          readOnly={readOnly}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </section>
  );
}

function MatchButton({
  match,
  participantsById,
  readOnly,
  onSelect,
}: {
  match: GeneratedTournamentMatch;
  participantsById: Map<string, TournamentParticipant>;
  readOnly: boolean;
  onSelect: () => void;
}) {
  const playerOne = getParticipantLabel(
    match.playerOneRegistrationId,
    match.playerOneSlot,
    participantsById
  );
  const playerTwo = getParticipantLabel(
    match.playerTwoRegistrationId,
    match.playerTwoSlot,
    participantsById
  );

  return (
    <button
      type="button"
      data-admin-tournament-match={match.id}
      aria-haspopup="dialog"
      aria-label={`${readOnly ? "View" : "Manage"} ${match.roundName}, match ${match.matchNumber}: ${playerOne} versus ${playerTwo}`}
      onClick={onSelect}
      className="group flex min-h-11 min-w-0 flex-col rounded-xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-orange-400/45 hover:bg-orange-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
    >
      <div className="flex w-full min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-xs font-black uppercase tracking-wider text-orange-300">
            {match.roundName}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Match {match.matchNumber} · Best of {match.seriesBestOf}
          </p>
        </div>
        <MatchStatus status={match.status} />
      </div>

      <div className="mt-4 grid w-full min-w-0 gap-2">
        <PlayerSummary
          name={playerOne}
          score={match.playerOneScore}
          winner={
            Boolean(match.playerOneRegistrationId) &&
            match.winnerRegistrationId === match.playerOneRegistrationId
          }
        />
        <PlayerSummary
          name={playerTwo}
          score={match.playerTwoScore}
          winner={
            Boolean(match.playerTwoRegistrationId) &&
            match.winnerRegistrationId === match.playerTwoRegistrationId
          }
        />
      </div>

      <span className="mt-4 inline-flex min-h-11 w-full items-center justify-between border-t border-white/10 pt-3 text-xs font-black uppercase tracking-wider text-zinc-400 transition group-hover:text-orange-200">
        {readOnly ? "View match history" : "Open match management"}
        <ChevronRight size={18} aria-hidden="true" />
      </span>
    </button>
  );
}

function PlayerSummary({
  name,
  score,
  winner,
}: {
  name: string;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <span
        className={`min-w-0 break-words font-bold ${
          winner ? "text-orange-200" : "text-zinc-300"
        }`}
      >
        {name}
      </span>
      <span className="grid h-8 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-black/40 font-mono font-black text-white">
        {score ?? "-"}
      </span>
    </div>
  );
}

function MatchStatus({ status }: { status: GeneratedTournamentMatch["status"] }) {
  const tone =
    status === "completed"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : status === "in_progress"
        ? "border-orange-400/35 bg-orange-500/10 text-orange-200"
        : status === "pending_review"
          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-black/30 text-zinc-400";

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${tone}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function buildParticipantsById(tournament: TournamentCard | null) {
  const participants = new Map<string, TournamentParticipant>();

  for (const participant of [
    ...(tournament?.participants ?? []),
    ...(tournament?.bracketParticipants ?? []),
  ]) {
    participants.set(participant.registrationId, participant);
  }

  return participants;
}

function sortGeneratedBrackets(tournament: TournamentCard | null) {
  if (!tournament) return [];

  const bracketOrder = new Map(
    tournament.brackets.map((bracket, index) => [bracket.id, index])
  );
  return tournament.generatedBrackets.slice().sort(
    (left, right) =>
      (bracketOrder.get(left.tournamentBracketId) ?? Number.MAX_SAFE_INTEGER) -
        (bracketOrder.get(right.tournamentBracketId) ??
          Number.MAX_SAFE_INTEGER) ||
      left.generatedAt.localeCompare(right.generatedAt)
  );
}

function findSelectedMatch(
  brackets: GeneratedTournamentBracket[],
  matchId: string | null
): SelectedMatch | null {
  if (!matchId) return null;

  for (const bracket of brackets) {
    const match = bracket.matches.find((candidate) => candidate.id === matchId);
    if (match) {
      return { match, bracketFormat: bracket.format };
    }
  }

  return null;
}

function getParticipantLabel(
  registrationId: string | null,
  slot: number | null,
  participantsById: Map<string, TournamentParticipant>
) {
  if (registrationId) {
    return participantsById.get(registrationId)?.name ?? "Recorded competitor";
  }

  return slot ? `Slot ${slot}` : "TBD";
}

function formatBracketFormat(format: GeneratedTournamentBracket["format"]) {
  return format === "single_elimination"
    ? "Single elimination"
    : "Round robin";
}
