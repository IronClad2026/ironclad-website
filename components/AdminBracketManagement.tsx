"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import AdminBracketPopulation, {
  type BracketPopulationData,
} from "@/components/AdminBracketPopulation";

export type AdminBracketTournamentOption = {
  id: string;
  title: string;
  brackets: Array<
    Omit<BracketPopulationData, "generatedBracketId" | "format"> & {
      generatedBracketId: string | null;
      format: BracketPopulationData["format"] | null;
      actualMatchCount: number;
      expectedMatchCount: number;
    }
  >;
};

export default function AdminBracketManagement({
  tournaments,
  notice,
}: {
  tournaments: AdminBracketTournamentOption[];
  notice?: "population-saved" | "population-failed";
}) {
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
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

  const selectTournament = (nextTournamentId: string) => {
    const tournament = tournaments.find(
      (item) => item.id === nextTournamentId
    );
    setTournamentId(nextTournamentId);
    setBracketId(tournament?.brackets[0]?.bracketId ?? "");
  };

  return (
    <section className="rounded-3xl border border-orange-500/25 bg-gradient-to-br from-zinc-950 via-zinc-950 to-orange-950/30 p-6 shadow-2xl shadow-orange-950/10 backdrop-blur">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
          <GitBranch size={23} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-400">
            Tournament Operations
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            Manual Bracket Placement
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Select a tournament and generated bracket, then assign approved
            participants to exact public bracket slots.
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm font-bold ${
            notice === "population-saved"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice === "population-saved"
            ? "Bracket assignments saved and published."
            : "Bracket assignments could not be saved. Confirm every selected player is approved and unique."}
        </div>
      )}

      {tournaments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-zinc-500">
          No generated tournament brackets are available.
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Tournament
              </span>
              <select
                value={selectedTournament?.id ?? ""}
                onChange={(event) => selectTournament(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-bold text-white outline-none transition focus:border-orange-400"
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Bracket
              </span>
              <select
                value={selectedBracket?.bracketId ?? ""}
                onChange={(event) => setBracketId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-bold text-white outline-none transition focus:border-orange-400"
              >
                {(selectedTournament?.brackets ?? []).map((bracket) => (
                  <option key={bracket.bracketId} value={bracket.bracketId}>
                    {bracket.bracketName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedBracket?.generatedBracketId && selectedBracket.format ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5">
              {selectedBracket.actualMatchCount <
                selectedBracket.expectedMatchCount && (
                <div className="mb-5 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <p className="font-black uppercase tracking-wider">
                    Bracket synchronization repair required
                  </p>
                  <p className="mt-2 leading-6">
                    This bracket has {selectedBracket.actualMatchCount} of{" "}
                    {selectedBracket.expectedMatchCount} required match records.
                    Use Repair Missing Match Records before saving player
                    assignments.
                  </p>
                  <Link
                    href={`/admin/tournaments?selected=${selectedTournament.id}`}
                    className="mt-3 inline-flex font-black text-amber-200 underline underline-offset-4"
                  >
                    Open Tournament Structure
                  </Link>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-black text-white">
                {selectedTournament.title} - {selectedBracket.bracketName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                {selectedBracket.slotCount} slots -{" "}
                    {selectedBracket.participants.length} approved participants
                  </p>
                </div>
                <Link
                  href="/tournaments"
                  className="text-sm font-black text-sky-300 transition hover:text-sky-200"
                >
                  View Current Bracket
                </Link>
              </div>
              <AdminBracketPopulation
                tournamentId={selectedTournament.id}
                tournamentTitle={selectedTournament.title}
                bracket={{
                  ...selectedBracket,
                  generatedBracketId: selectedBracket.generatedBracketId,
                  format: selectedBracket.format,
                }}
                buttonLabel="Populate Tournament Bracket"
              />
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
              The selected bracket has no generated structure yet.
            </p>
          )}
        </>
      )}
    </section>
  );
}
