"use client";

import { useAuth } from "@clerk/nextjs";
import {
  type FormEvent,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  cleanupPreparedReplayUploads,
  finalizeMatchResult,
  prepareMatchReplayUploads,
  submitNoShowReport,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import InfoTooltip from "@/components/InfoTooltip";
import { createAuthenticatedBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { GeneratedTournamentMatch } from "@/lib/tournaments";

const initialState: MatchResultActionState = {
  status: "idle",
  message: "",
};

const maxReplayBytes = 10 * 1024 * 1024;

type ReplaySubmissionPhase =
  | "idle"
  | "preparing"
  | "uploading"
  | "finalizing";

export default function PlayerMatchResultForm({
  match,
  playerOneName,
  playerTwoName,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
}) {
  const [noShowState, noShowFormAction, noShowPending] = useActionState(
    submitNoShowReport,
    initialState
  );
  const { getToken } = useAuth();
  const router = useRouter();
  const submissionInFlightRef = useRef(false);
  const authenticatedSupabase = useMemo(
    () => createAuthenticatedBrowserSupabaseClient(getToken),
    [getToken]
  );
  const replayInputRef = useRef<HTMLInputElement>(null);
  const replayInputLabelId = useId();
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [finalizationUncertain, setFinalizationUncertain] = useState(false);
  const [submissionPhase, setSubmissionPhase] =
    useState<ReplaySubmissionPhase>("idle");
  const [uploadGameNumber, setUploadGameNumber] = useState(0);
  const [playerOneScore, setPlayerOneScore] = useState("");
  const [playerTwoScore, setPlayerTwoScore] = useState("");
  const [winnerRegistrationId, setWinnerRegistrationId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedReplays, setSelectedReplays] = useState<File[]>([]);
  const [replaySelectionError, setReplaySelectionError] = useState("");
  const [noShowOpen, setNoShowOpen] = useState(false);
  const scoreInfo = useMemo(
    () =>
      getScoreInfo(
        playerOneScore,
        playerTwoScore,
        winsRequired,
        match.seriesBestOf
      ),
    [match.seriesBestOf, playerOneScore, playerTwoScore, winsRequired]
  );
  const selectedReplayCount = selectedReplays.length;
  const replayCountMatches =
    scoreInfo.requiredReplayCount !== null &&
    selectedReplayCount === scoreInfo.requiredReplayCount &&
    !replaySelectionError;
  const submitDisabled =
    pending ||
    noShowPending ||
    finalizationUncertain ||
    scoreInfo.requiredReplayCount === null ||
    !replayCountMatches;

  useEffect(() => {
    if (noShowState.status === "success") {
      router.refresh();
    }
  }, [noShowState.status, router]);

  const submitMatchResult = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlightRef.current || finalizationUncertain) return;

    const parsedPlayerOneScore = parseScore(playerOneScore);
    const parsedPlayerTwoScore = parseScore(playerTwoScore);
    const selectionError = validateReplaySelection(selectedReplays);

    if (
      parsedPlayerOneScore === null ||
      parsedPlayerTwoScore === null ||
      scoreInfo.requiredReplayCount === null ||
      !winnerRegistrationId
    ) {
      setState({
        status: "error",
        message: "Enter the final score and select the match winner.",
      });
      return;
    }

    if (selectionError) {
      setReplaySelectionError(selectionError);
      setState({ status: "error", message: selectionError });
      return;
    }

    if (selectedReplays.length !== scoreInfo.requiredReplayCount) {
      setState({
        status: "error",
        message: `This score requires exactly ${scoreInfo.requiredReplayCount} replay file${
          scoreInfo.requiredReplayCount === 1 ? "" : "s"
        }.`,
      });
      return;
    }

    submissionInFlightRef.current = true;
    setPending(true);
    setState(initialState);
    setSubmissionPhase("preparing");
    setUploadGameNumber(0);
    let preparedPaths: string[] = [];
    let preparedAttemptId = "";
    let reachedFinalization = false;

    try {
      const preparation = await prepareMatchReplayUploads({
        matchId: match.id,
        playerOneScore: parsedPlayerOneScore,
        playerTwoScore: parsedPlayerTwoScore,
        winnerRegistrationId,
        replayFiles: selectedReplays.map((file) => ({
          name: file.name,
          size: file.size,
        })),
      });

      if (preparation.status === "error") {
        setState(preparation);
        return;
      }

      preparedAttemptId = preparation.attemptId;
      preparedPaths = preparation.uploads.map((upload) => upload.path);

      for (const [index, upload] of preparation.uploads.entries()) {
        setSubmissionPhase("uploading");
        setUploadGameNumber(index + 1);
        const { data, error } = await authenticatedSupabase.storage
          .from(preparation.bucket)
          .uploadToSignedUrl(
            upload.path,
            upload.token,
            selectedReplays[index],
            {
              cacheControl: "3600",
              contentType: "application/octet-stream",
              upsert: false,
            }
          );

        if (error || !data || data.path !== upload.path) {
          throw new Error("SIGNED_UPLOAD_FAILED");
        }
      }

      setSubmissionPhase("finalizing");
      reachedFinalization = true;
      const result = await finalizeMatchResult({
        matchId: match.id,
        attemptId: preparedAttemptId,
        playerOneScore: parsedPlayerOneScore,
        playerTwoScore: parsedPlayerTwoScore,
        winnerRegistrationId,
        notes,
      });

      setState(result);
      if (result.status === "error" && result.requiresRefresh) {
        setFinalizationUncertain(true);
      }

      if (result.status === "success") {
        setPlayerOneScore("");
        setPlayerTwoScore("");
        setWinnerRegistrationId("");
        setNotes("");
        setSelectedReplays([]);
        setReplaySelectionError("");
        if (replayInputRef.current) replayInputRef.current.value = "";
        router.refresh();
      }
    } catch {
      // Once finalization is dispatched, its trusted server path exclusively
      // owns pre-commit cleanup. A second browser cleanup could otherwise race
      // an in-flight RPC whose response was lost and delete soon-to-be-
      // referenced proof.
      if (!reachedFinalization && preparedPaths.length > 0) {
        await cleanupPreparedReplayUploads({
          matchId: match.id,
          attemptId: preparedAttemptId,
        }).catch(() => undefined);
      }

      setState({
        status: "error",
        message: reachedFinalization
          ? "IronClad could not confirm the final response. Refresh this match before retrying."
          : "The replay upload failed. Your selected files are still available; please try again.",
      });
      if (reachedFinalization) setFinalizationUncertain(true);
    } finally {
      submissionInFlightRef.current = false;
      setPending(false);
      setSubmissionPhase("idle");
      setUploadGameNumber(0);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submitMatchResult} className="space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-white">
            Submit Match Result
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Enter the final BO{match.seriesBestOf} score and upload one .rec
            replay for every game played. Your opponent will be asked to confirm
            or dispute the result. Screenshots are not accepted as substitute
            Match-result proof.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PlayerLabel label="Player A" name={playerOneName} />
          <PlayerLabel label="Player B" name={playerTwoName} />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <ScoreField
            name="playerOneScore"
            label={playerOneName}
            max={winsRequired}
            value={playerOneScore}
            onChange={setPlayerOneScore}
          />
          <ScoreField
            name="playerTwoScore"
            label={playerTwoName}
            max={winsRequired}
            value={playerTwoScore}
            onChange={setPlayerTwoScore}
          />
          <div className="rounded-xl border border-orange-400/20 bg-orange-500/10 p-4 text-xs text-orange-100/80">
            Winner must finish on {winsRequired} wins.
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-slate-300">Winner</span>
          <select
            name="winnerRegistrationId"
            required
            value={winnerRegistrationId}
            onChange={(event) => setWinnerRegistrationId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-orange-400"
          >
            <option value="">Select winner</option>
            <option value={match.playerOneRegistrationId ?? ""}>
              {playerOneName}
            </option>
            <option value={match.playerTwoRegistrationId ?? ""}>
              {playerTwoName}
            </option>
          </select>
        </label>

        <div className="block">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-300">
            <span id={replayInputLabelId}>
              Replay proofs (.rec required)
            </span>
            <InfoTooltip
              align="start"
              label="About replay uploads"
              content="Upload one unique CoH3 .rec for each Game actually played. Each file may be up to 10 MiB. Replays are private, and screenshots are not accepted as substitute Match-result proof."
            />
          </div>
          <input
            ref={replayInputRef}
            aria-labelledby={replayInputLabelId}
            type="file"
            accept=".rec"
            multiple
            required
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              setSelectedReplays(files);
              setReplaySelectionError(validateReplaySelection(files));
            }}
            className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:font-bold file:text-white"
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-[11px] leading-5 text-slate-400">
          <p>
            {scoreInfo.message ??
              `Required replays: ${scoreInfo.requiredReplayCount}. Selected: ${selectedReplayCount}.`}
          </p>
          {scoreInfo.requiredReplayCount !== null &&
            selectedReplayCount > 0 &&
            selectedReplayCount !== scoreInfo.requiredReplayCount && (
              <p className="mt-1 font-bold text-orange-200">
                Upload exactly {scoreInfo.requiredReplayCount} replay file
                {scoreInfo.requiredReplayCount === 1 ? "" : "s"} for this
                score.
              </p>
            )}
          {replaySelectionError && (
            <p className="mt-1 font-bold text-red-200">
              {replaySelectionError}
            </p>
          )}
        </div>
        <label className="block">
          <span className="text-xs font-bold text-slate-300">
            Notes (optional)
          </span>
          <textarea
            name="notes"
            maxLength={2000}
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-400"
          />
        </label>

        {pending && (
          <p
            aria-live="polite"
            className="rounded-lg border border-orange-400/30 bg-orange-500/10 p-2 text-xs text-orange-100"
          >
            {getSubmissionPhaseLabel(
              submissionPhase,
              uploadGameNumber,
              selectedReplayCount
            )}
          </p>
        )}

        {state.status !== "idle" && (
          <p
            aria-live="polite"
            className={`rounded-lg border p-2 text-xs ${
              state.status === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50"
        >
          {pending
            ? getSubmissionPhaseLabel(
                submissionPhase,
                uploadGameNumber,
                selectedReplayCount
              )
            : "Submit for Opponent Confirmation"}
        </button>
      </form>

      <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.04] p-4">
        <button
          type="button"
          disabled={pending || noShowPending || finalizationUncertain}
          onClick={() => setNoShowOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-50"
        >
          <span>
            <span className="block text-xs font-black uppercase tracking-wider text-red-200">
              Report No-Show
            </span>
            <span className="mt-1 block text-[11px] leading-5 text-slate-500">
              Use this only if your opponent did not appear. They will be
              notified and may confirm or dispute the report.
            </span>
          </span>
          <span className="rounded-lg border border-red-400/30 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-200">
            {noShowOpen ? "Close" : "Open"}
          </span>
        </button>

        {noShowOpen && (
          <form action={noShowFormAction} className="mt-4 space-y-4">
            <input type="hidden" name="matchId" value={match.id} />
            <label className="block">
              <span className="text-xs font-bold text-slate-300">
                Missing Player
              </span>
              <select
                name="noShowRegistrationId"
                required
                defaultValue=""
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-red-400"
              >
                <option value="">Select opponent</option>
                <option value={match.playerOneRegistrationId ?? ""}>
                  {playerOneName}
                </option>
                <option value={match.playerTwoRegistrationId ?? ""}>
                  {playerTwoName}
                </option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-300">
                Note or evidence reference (optional)
              </span>
              <textarea
                name="noShowNotes"
                maxLength={2000}
                rows={3}
                placeholder="Example: waited 15 minutes in lobby, opponent did not respond."
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[11px] leading-5 text-red-100/80">
              Confirm this only when your opponent failed to show up. A
              confirmed no-show may affect leaderboard participation points.
            </p>
            {noShowState.status !== "idle" && (
              <p
                className={`rounded-lg border p-2 text-xs ${
                  noShowState.status === "success"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-red-400/30 bg-red-500/10 text-red-200"
                }`}
              >
                {noShowState.message}
              </p>
            )}
            <button
              type="submit"
              disabled={noShowPending || pending || finalizationUncertain}
              className="w-full rounded-xl bg-red-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {noShowPending ? "Submitting..." : "Submit No-Show Report"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PlayerLabel({ label, name }: { label: string; name: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate font-black text-white">{name}</p>
    </div>
  );
}

function ScoreField({
  name,
  label,
  max,
  value,
  onChange,
}: {
  name: string;
  label: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block truncate text-xs font-bold text-slate-300">
        {label}
      </span>
      <input
        name={name}
        type="number"
        min="0"
        max={max}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
      />
    </label>
  );
}

function getScoreInfo(
  playerOneScore: string,
  playerTwoScore: string,
  winsRequired: number,
  seriesBestOf: number
) {
  const playerOne = parseScore(playerOneScore);
  const playerTwo = parseScore(playerTwoScore);

  if (playerOne === null || playerTwo === null) {
    return {
      requiredReplayCount: null,
      message: "Enter the final score to calculate required replay count.",
    };
  }

  if (playerOne === playerTwo) {
    return {
      requiredReplayCount: null,
      message: "Final score cannot be tied.",
    };
  }

  const winnerScore = Math.max(playerOne, playerTwo);
  const loserScore = Math.min(playerOne, playerTwo);

  if (winnerScore !== winsRequired || loserScore >= winsRequired) {
    return {
      requiredReplayCount: null,
      message: `BO${seriesBestOf} requires the winner to finish on ${winsRequired} wins.`,
    };
  }

  return {
    requiredReplayCount: playerOne + playerTwo,
    message: null,
  };
}

function parseScore(value: string) {
  if (value.trim() === "") return null;

  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

function validateReplaySelection(files: File[]) {
  if (files.length === 0) {
    return "Upload the match replay files before submitting.";
  }

  if (files.some((file) => file.size <= 0)) {
    return "Replay files cannot be empty.";
  }

  if (files.some((file) => file.size > maxReplayBytes)) {
    return "Replay files must be 10 MiB or smaller.";
  }

  if (files.some((file) => !file.name.toLowerCase().endsWith(".rec"))) {
    return "Every replay file must use the .rec extension.";
  }

  return "";
}

function getSubmissionPhaseLabel(
  phase: ReplaySubmissionPhase,
  uploadGameNumber: number,
  replayCount: number
) {
  if (phase === "preparing") return "Preparing replay upload…";
  if (phase === "uploading") {
    return `Uploading replay ${uploadGameNumber} of ${replayCount}…`;
  }
  if (phase === "finalizing") return "Verifying and submitting result…";
  return "Verifying and submitting result…";
}
