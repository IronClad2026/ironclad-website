import { generateTournamentBracket } from "@/app/admin/tournaments/actions";
import type {
  TournamentFormValues,
  TournamentGeneratedBracketSummary,
} from "@/components/admin/tournaments/TournamentEditor";
import {
  formatTournamentDivisionState,
  getEffectiveTournamentDivisionState,
  type TournamentDivisionStateResolution,
} from "@/lib/tournament-division-state";
import { TOURNAMENT_BRACKET_CONFIGS } from "@/lib/tournaments";

export default function TournamentBracketStructureControls({
  divisionStates,
  generatedByBracket,
  notice,
  readOnly = false,
  values,
}: {
  divisionStates: readonly TournamentDivisionStateResolution[];
  generatedByBracket: Map<string, TournamentGeneratedBracketSummary>;
  notice?: string;
  readOnly?: boolean;
  values: TournamentFormValues;
}) {
  if (!values.id) return null;
  const tournamentId = values.id;

  return (
    <section className="min-w-0 rounded-3xl border border-sky-500/20 bg-sky-950/20 p-4 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">
        Private structure
      </p>
      <h2 className="mt-2 text-2xl font-black text-white">
        Bracket Generation / Repair
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
        Generate or safely regenerate the existing private structure only when
        the authoritative readiness guard permits it. Seeding and Division
        launch remain separate below.
      </p>

      {readOnly && (
        <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-950/20 p-4 text-sm font-bold text-amber-100">
          Terminal Tournament — private bracket structure is retained as
          read-only history.
        </p>
      )}

      {notice && (
        <GenerationNotice notice={notice} />
      )}

      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-3">
        {TOURNAMENT_BRACKET_CONFIGS.map((config) => {
          const bracket = values[config.fieldPrefix];
          if (!bracket.id) return null;

          const generated = generatedByBracket.get(bracket.id);
          const divisionState = divisionStates.find(
            (division) => division.bracketId === bracket.id
          );
          const approvedCount = divisionState?.approvedCount;
          const requiredCount = divisionState?.requiredCount;
          const launchedAt = divisionState?.launchedAt ?? bracket.launchedAt;
          const isReady = divisionState?.state === "ready";
          const effectiveState = divisionState
            ? getEffectiveTournamentDivisionState(divisionState)
            : null;
          const formId = `workspace-generate-bracket-${bracket.id}`;

          return (
            <article
              key={bracket.id}
              className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              <h3 className="break-words font-black text-white">
                {config.label}
              </h3>
              <p className="mt-2 break-words text-sm text-zinc-400">
                {approvedCount !== null && approvedCount !== undefined &&
                requiredCount !== null && requiredCount !== undefined
                  ? `${approvedCount}/${requiredCount} approved`
                  : "Authoritative readiness unavailable"}
                {generated
                  ? ` — ${formatLabel(generated.format)} private structure ready`
                  : " — not generated"}
              </p>
              <p
                className={`mt-2 text-xs font-black uppercase tracking-wider ${
                  effectiveState === "cancelled" || effectiveState === "voided"
                    ? "text-red-300"
                    : effectiveState === "completed"
                    ? "text-emerald-300"
                    : effectiveState === "in_progress"
                      ? "text-sky-300"
                      : effectiveState === "ready"
                      ? "text-emerald-300"
                      : "text-amber-300"
                }`}
              >
                {divisionState
                  ? formatTournamentDivisionState(divisionState)
                  : "Division state unavailable"}
              </p>
              <form id={formId} action={generateTournamentBracket}>
                <input type="hidden" name="tournamentId" value={tournamentId} />
                <input type="hidden" name="bracketId" value={bracket.id} />
                <input type="hidden" name="workspaceSection" value="bracket" />
                <button
                  type="submit"
                  disabled={readOnly || Boolean(launchedAt) || !isReady}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-center text-sm font-black text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {readOnly
                    ? "Terminal Tournament — View Only"
                    : launchedAt
                    ? "Division Launched"
                    : !divisionState
                      ? "Division State Unavailable"
                    : !isReady
                      ? `Requires ${requiredCount ?? 8}/${requiredCount ?? 8} Approved`
                      : generated
                        ? "Regenerate Private Structure"
                        : "Generate Private Structure"}
                </button>
              </form>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function GenerationNotice({ notice }: { notice: string }) {
  const success = notice === "bracket-generated";
  const message =
    notice === "bracket-generated"
      ? "Private bracket structure generated from the exact approved roster."
      : notice === "generation-pending"
        ? "The private structure was not generated. Confirm readiness and retry."
        : notice === "generation-blocked"
          ? "Regeneration was blocked because the Division is launched or protected competition activity exists."
          : notice === "generation-failed"
            ? "Bracket generation failed. Existing competition data was left unchanged."
            : null;

  if (!message) return null;

  return (
    <div
      role={success ? "status" : "alert"}
      className={`mt-5 rounded-xl border p-4 text-sm ${
        success
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/30 bg-red-500/10 text-red-300"
      }`}
    >
      {message}
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
