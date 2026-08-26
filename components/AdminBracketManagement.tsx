"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitBranch, RefreshCw } from "lucide-react";
import AdminBracketPopulation, {
  type BracketPopulationData,
} from "@/components/AdminBracketPopulation";
import { launchTournamentDivision } from "@/app/admin/tournaments/actions";
import {
  isTournamentTerminalStatus,
  type TournamentStatus,
} from "@/lib/tournaments";

export type AdminBracketTournamentOption = {
  id: string;
  title: string;
  status: TournamentStatus;
  brackets: Array<
    Omit<BracketPopulationData, "generatedBracketId" | "format"> & {
      generatedBracketId: string | null;
      format: BracketPopulationData["format"] | null;
      actualMatchCount: number;
      expectedMatchCount: number;
      approvedCount: number;
      requiredCount: number;
      isReady: boolean;
      launchedAt: string | null;
      mapPoolPublishedAt: string | null;
      currentMapCount: number;
    }
  >;
};

export default function AdminBracketManagement({
  tournaments,
  notice,
  loadError = false,
  fixedTournamentId,
}: {
  tournaments: AdminBracketTournamentOption[];
  loadError?: boolean;
  fixedTournamentId?: string;
  notice?:
    | "population-saved"
    | "population-failed"
    | "division-launched"
    | "division-already-launched"
    | "division-launch-failed";
}) {
  const router = useRouter();
  const [tournamentId, setTournamentId] = useState(
    fixedTournamentId ?? tournaments[0]?.id ?? ""
  );
  const selectedTournament = useMemo(
    () =>
      tournaments.find((tournament) => tournament.id === tournamentId) ??
      tournaments[0],
    [tournamentId, tournaments]
  );
  const [bracketId, setBracketId] = useState(
    selectedTournament?.brackets[0]?.bracketId ?? ""
  );
  const selectedBracket =
    selectedTournament?.brackets.find(
      (bracket) => bracket.bracketId === bracketId
    ) ?? selectedTournament?.brackets[0];
  const terminalTournament = selectedTournament
    ? isTournamentTerminalStatus(selectedTournament.status)
    : false;
  const assignedRegistrationIds = new Set(
    Object.values(selectedBracket?.assignments ?? {}).filter(
      (registrationId): registrationId is string => Boolean(registrationId)
    )
  );
  const assignmentsComplete = Boolean(
    selectedBracket &&
      selectedBracket.slotCount === selectedBracket.requiredCount &&
      assignedRegistrationIds.size === selectedBracket.requiredCount &&
      [...assignedRegistrationIds].every((registrationId) =>
        selectedBracket.participants.some(
          (participant) => participant.id === registrationId
        )
      )
  );
  const structureComplete = Boolean(
    selectedBracket &&
      selectedBracket.actualMatchCount === selectedBracket.expectedMatchCount
  );
  const mapPoolReady = Boolean(
    selectedBracket?.mapPoolPublishedAt &&
      selectedBracket.currentMapCount >= 5
  );
  const canLaunch = Boolean(
    selectedBracket?.generatedBracketId &&
      selectedBracket.isReady &&
      assignmentsComplete &&
      structureComplete &&
      mapPoolReady &&
      !selectedBracket.launchedAt &&
      !terminalTournament
  );

  const selectTournament = (nextTournamentId: string) => {
    const tournament = tournaments.find(
      (item) => item.id === nextTournamentId
    );
    setTournamentId(nextTournamentId);
    setBracketId(tournament?.brackets[0]?.bracketId ?? "");
  };

  return (
    <section className="self-start rounded-3xl border border-orange-500/25 bg-gradient-to-br from-zinc-950 via-zinc-950 to-orange-950/30 p-4 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
          <GitBranch size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-400">
            Tournament Operations
          </p>
          <h2 className="mt-1 break-words text-xl font-bold">
            Manual Bracket Placement
          </h2>
          <p className="mt-1 text-sm leading-5 text-zinc-400">
            Prepare each generated bracket privately, then launch its division
            explicitly when all eight approved players are seeded.
          </p>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-100"
        >
          <p className="font-black uppercase tracking-wider text-red-300">
            Operational data unavailable
          </p>
          <p className="mt-2 text-sm leading-6">
            Operational Tournament/Match data could not be loaded. Retry before
            making bracket, seeding, or launch decisions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white transition hover:bg-red-400"
            >
              <RefreshCw aria-hidden="true" size={16} />
              Retry
            </button>
            <Link
              href="/admin/tournaments"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-white transition hover:border-white/30 hover:bg-white/5"
            >
              Open Tournament Administration
            </Link>
          </div>
        </div>
      )}

      {!loadError && notice && (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm font-bold ${
              notice === "population-saved" ||
              notice === "division-launched" ||
              notice === "division-already-launched"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice === "population-saved"
            ? "Bracket assignments saved privately. The division remains unpublished until Launch Division."
            : notice === "division-launched"
              ? "Division launched. Its bracket is now public and its roster is locked."
              : notice === "division-already-launched"
                ? "This division was already launched; its original launch time and notifications were preserved."
                : notice === "division-launch-failed"
                  ? "Division launch failed. Confirm readiness, all eight unique assignments, and private-draft integrity."
                  : "Bracket assignments could not be saved. Confirm every selected player is approved and unique."}
        </div>
      )}

      {!loadError && (tournaments.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
          No generated tournament brackets are available.
        </div>
      ) : (
        <>
          <div
            className={`mt-4 grid gap-3 ${
              fixedTournamentId ? "" : "md:grid-cols-2"
            }`}
          >
            {!fixedTournamentId && (
              <label>
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Tournament
                </span>
                <select
                  value={selectedTournament?.id ?? ""}
                  onChange={(event) => selectTournament(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-orange-400"
                >
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Bracket
              </span>
              <select
                value={selectedBracket?.bracketId ?? ""}
                onChange={(event) => setBracketId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-orange-400"
              >
                {(selectedTournament?.brackets ?? []).map((bracket) => (
                  <option key={bracket.bracketId} value={bracket.bracketId}>
                    {bracket.bracketName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {terminalTournament && (
            <div className="mt-4 border border-amber-400/30 bg-amber-950/20 p-4 text-sm text-amber-100">
              <p className="font-black uppercase tracking-wider">
                Terminal tournament — view only
              </p>
              <p className="mt-2 leading-6">
                Bracket facts remain visible, but seeding and launch controls are
                unavailable.
              </p>
            </div>
          )}

          {selectedBracket?.generatedBracketId && selectedBracket.format ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              {!terminalTournament && selectedBracket.actualMatchCount <
                selectedBracket.expectedMatchCount && (
                <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-black uppercase tracking-wider">
                    Bracket synchronization repair required
                  </p>
                  <p className="mt-1 leading-5">
                    This bracket has {selectedBracket.actualMatchCount} of{" "}
                    {selectedBracket.expectedMatchCount} required match records.
                    Regenerate the private structure before saving player
                    assignments. Regeneration resets this unlaunched draft and
                    requires reseeding.
                  </p>
                  <Link
                    href={
                      fixedTournamentId
                        ? `/admin/tournaments/${encodeURIComponent(selectedTournament.id)}?section=bracket`
                        : `/admin/tournaments?selected=${selectedTournament.id}`
                    }
                    className="mt-2 inline-flex min-h-11 items-center font-black text-amber-200 underline underline-offset-4"
                  >
                    Open Tournament Structure
                  </Link>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-black text-white">
                    {selectedTournament.title} - {selectedBracket.bracketName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {selectedBracket.approvedCount}/{selectedBracket.requiredCount}
                    {" "}approved
                    {selectedBracket.isReady
                      ? " — ready for private bracket preparation"
                      : " — administrator review incomplete"}
                  </p>
                  <p
                    className={`mt-2 text-xs font-black uppercase tracking-wider ${
                      selectedBracket.launchedAt
                        ? "text-sky-300"
                        : "text-amber-300"
                    }`}
                  >
                    {selectedBracket.launchedAt
                      ? `Launched ${new Date(
                          selectedBracket.launchedAt
                        ).toLocaleString()}`
                      : "Private draft — not published"}
                  </p>
                </div>
                {selectedBracket.launchedAt && (
                  <Link
                    href="/tournaments"
                    className="inline-flex min-h-11 shrink-0 items-center text-sm font-black text-sky-300 transition hover:text-sky-200"
                  >
                    View Public Bracket
                  </Link>
                )}
              </div>
              {!terminalTournament && !selectedBracket.launchedAt && (
                <AdminBracketPopulation
                  tournamentId={selectedTournament.id}
                  tournamentTitle={selectedTournament.title}
                  bracket={{
                    ...selectedBracket,
                    generatedBracketId: selectedBracket.generatedBracketId,
                    format: selectedBracket.format,
                  }}
                  buttonLabel="Edit Private Seeding"
                  workspaceTournamentId={fixedTournamentId}
                />
              )}

              {!terminalTournament && !selectedBracket.launchedAt && (
                <form
                  action={launchTournamentDivision}
                  className="mt-4 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4"
                >
                  <input
                    type="hidden"
                    name="tournamentBracketId"
                    value={selectedBracket.bracketId}
                  />
                  {fixedTournamentId && (
                    <input
                      type="hidden"
                      name="workspaceTournamentId"
                      value={fixedTournamentId}
                    />
                  )}
                  <p className="text-xs font-black uppercase tracking-wider text-orange-300">
                    Final publication boundary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Launch publishes only this division, records its actual start
                    time, locks its roster, and closes its waitlist. Other
                    divisions remain unaffected.
                  </p>
                  <button
                    type="submit"
                    disabled={!canLaunch}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 sm:w-auto"
                  >
                    Launch Division
                  </button>
                  {!canLaunch && (
                    <p className="mt-3 text-xs leading-5 text-zinc-400">
                      {!mapPoolReady
                        ? "Publish at least five eligible 1v1 maps before launching this Division."
                        : `Launch unlocks after the private structure is complete, readiness is ${selectedBracket.requiredCount}/${selectedBracket.requiredCount} approved, and every seed is assigned to a unique approved player.`}
                    </p>
                  )}
                </form>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
              The selected bracket has no generated structure yet.
            </p>
          )}
        </>
      ))}
    </section>
  );
}
