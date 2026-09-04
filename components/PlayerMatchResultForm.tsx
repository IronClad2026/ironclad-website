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
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { getMatchActionMessage } from "@/lib/i18n/match-action-message";
import {
  changeMatchOutcome,
  changeMatchScore,
  getGameWinnerState,
  getPerspectiveScores,
  mapPerspectiveResult,
  type MatchEntryDraft,
} from "@/lib/match-result-entry";
import { createAuthenticatedBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { GeneratedTournamentMatch } from "@/lib/tournaments";

const initialState: MatchResultActionState = { status: "idle", message: "" };
const inputClass =
  "min-h-11 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-orange-400";
const buttonClass =
  "min-h-11 rounded-lg border border-white/20 px-3 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:opacity-50";

export default function PlayerMatchResultForm({
  match,
  playerOneName,
  playerTwoName,
  viewerRegistrationId,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
  viewerRegistrationId: string | null;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const { getToken } = useAuth();
  const router = useRouter();
  const id = useId();
  const supabase = useMemo(
    () => createAuthenticatedBrowserSupabaseClient(getToken),
    [getToken]
  );
  const inFlight = useRef(false);
  const [draft, setDraft] = useState<MatchEntryDraft<File>>({
    outcome: null,
    score: "",
    games: [],
  });
  const [notes, setNotes] = useState("");
  const [state, setState] = useState(initialState);
  const [phase, setPhase] = useState<
    "idle" | "preparing" | "uploading" | "finalizing"
  >("idle");
  const [uploadGame, setUploadGame] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [noShowState, noShowAction, noShowPending] = useActionState(
    submitNoShowReport,
    initialState
  );
  const result = mapPerspectiveResult(
    match,
    viewerRegistrationId,
    draft.outcome,
    draft.score
  );
  const games = result
    ? getGameWinnerState(
        match,
        result,
        draft.games.map((game) => game.winner)
      )
    : null;
  const pending = phase !== "idle";
  const locked = pending || noShowPending || uncertain || submitted;
  const opponentId =
    viewerRegistrationId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const opponentName =
    viewerRegistrationId === match.playerOneRegistrationId
      ? playerTwoName
      : playerOneName;
  const summary = result
    ? t("resultUx.namedResult", {
        winner:
          result.winnerRegistrationId === match.playerOneRegistrationId
            ? playerOneName
            : playerTwoName,
        loser:
          result.winnerRegistrationId === match.playerOneRegistrationId
            ? playerTwoName
            : playerOneName,
        winnerScore: Math.max(result.playerOneScore, result.playerTwoScore),
        loserScore: Math.min(result.playerOneScore, result.playerTwoScore),
      })
    : "";
  const replayError = (file: File | null) => {
    if (!file) return "";
    if (file.size <= 0) return t("resultForm.replayEmpty");
    if (file.size > 10 * 1024 * 1024) return t("resultForm.replayTooLarge");
    if (!file.name.toLowerCase().endsWith(".rec"))
      return t("resultForm.replayExtension");
    return "";
  };
  const ready = Boolean(
    result &&
      games?.complete &&
      draft.games.every((game) => game.replay && !replayError(game.replay)) &&
      notes.length <= 2000
  );
  const progress =
    phase === "uploading"
      ? t("resultForm.uploading", {
          current: uploadGame,
          total: draft.games.length,
        })
      : phase === "preparing"
        ? t("resultForm.preparing")
        : t("resultForm.finalizing");
  const updateGame = (
    index: number,
    change: Partial<MatchEntryDraft<File>["games"][number]>
  ) => {
    setDraft((current) => ({
      ...current,
      games: current.games.map((game, i) =>
        i === index ? { ...game, ...change } : game
      ),
    }));
  };
  useEffect(() => {
    if (noShowState.status === "success") router.refresh();
  }, [noShowState.status, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || locked) return;
    if (!ready || !result || !games) {
      setState({ status: "error", message: t("resultUx.completeRequired") });
      return;
    }
    const files = draft.games.map((game) => game.replay!);
    inFlight.current = true;
    setState(initialState);
    setPhase("preparing");
    let attemptId = "";
    let reachedFinalization = false;
    try {
      const preparation = await prepareMatchReplayUploads({
        matchId: match.id,
        ...result,
        replayFiles: files.map((file) => ({
          name: file.name,
          size: file.size,
        })),
        gameWinnerRegistrationIds: games.winners,
      });
      if (preparation.status === "error") {
        setState({
          ...preparation,
          message: getMatchActionMessage(preparation, t),
        });
        return;
      }
      attemptId = preparation.attemptId;
      if (
        preparation.uploads.length !== files.length ||
        preparation.uploads.some((upload, i) => upload.gameNumber !== i + 1)
      )
        throw new Error("UPLOAD_ORDER_INVALID");
      for (const [index, upload] of preparation.uploads.entries()) {
        setPhase("uploading");
        setUploadGame(index + 1);
        const { data, error } = await supabase.storage
          .from(preparation.bucket)
          .uploadToSignedUrl(upload.path, upload.token, files[index], {
            cacheControl: "3600",
            contentType: "application/octet-stream",
            upsert: false,
          });
        if (error || !data || data.path !== upload.path)
          throw new Error("SIGNED_UPLOAD_FAILED");
      }
      setPhase("finalizing");
      reachedFinalization = true;
      const response = await finalizeMatchResult({
        matchId: match.id,
        attemptId,
        ...result,
        notes,
      });
      setState({ ...response, message: getMatchActionMessage(response, t) });
      if (response.status === "error" && response.requiresRefresh)
        setUncertain(true);
      if (response.status === "success") {
        setSubmitted(true);
        router.refresh();
      }
    } catch {
      // After dispatch, finalization exclusively owns cleanup: the response
      // may be lost while the trusted result transaction is still committing.
      if (!reachedFinalization && attemptId)
        await cleanupPreparedReplayUploads({
          matchId: match.id,
          attemptId,
        }).catch(() => undefined);
      setState({
        status: "error",
        message: t(
          reachedFinalization
            ? "resultForm.responseUnknown"
            : "resultForm.uploadFailed"
        ),
      });
      if (reachedFinalization) setUncertain(true);
    } finally {
      inFlight.current = false;
      setPhase("idle");
    }
  };

  if (submitted || noShowState.status === "success" || uncertain)
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm font-black uppercase tracking-wide text-orange-200">
          {t(uncertain ? "resultUx.reconcileTitle" : "resultUx.waiting")}
        </p>
        {submitted && <p className="font-bold text-white">{summary}</p>}
        <p className="text-sm leading-6 text-zinc-300">
          {uncertain
            ? t("resultForm.responseUnknown")
            : t("resultUx.refreshSaved")}
        </p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => router.refresh()}
        >
          {t("resultUx.refresh")}
        </button>
      </div>
    );

  return (
    <div className="min-w-0 space-y-5">
      <form onSubmit={submit} aria-busy={pending} className="space-y-5">
        {pending && (
          <div
            role="status"
            className="rounded-xl border border-orange-400/40 bg-orange-500/10 p-4 font-bold text-orange-100"
          >
            {progress}
          </div>
        )}
        <fieldset
          disabled={locked}
          className={`min-w-0 space-y-5 ${pending ? "hidden" : ""}`}
        >
          <legend className="mb-3 text-xs font-black uppercase tracking-wide text-zinc-300">
            {t("resultForm.title")}
          </legend>
          <div className="flex flex-wrap items-end gap-3">
            <div
              role="group"
              aria-label={t("resultForm.title")}
              className="flex gap-1 rounded-xl border border-white/15 bg-black/30 p-1"
            >
              {(["won", "lost"] as const).map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  aria-pressed={draft.outcome === outcome}
                  onClick={() => {
                    if (outcome !== draft.outcome) {
                      setDraft(changeMatchOutcome(outcome));
                      setState(initialState);
                    }
                  }}
                  className={`${buttonClass} min-w-16 ${draft.outcome === outcome ? "border-orange-400 bg-orange-500 text-black" : "border-transparent text-zinc-300"}`}
                >
                  {t(`resultUx.${outcome}`)}
                </button>
              ))}
            </div>
            <label className="min-w-24 max-w-40 flex-1">
              <span className="mb-1 block text-xs font-bold text-zinc-300">
                {t("resultUx.score")}
              </span>
              <select
                required
                value={draft.score}
                disabled={!draft.outcome || locked}
                className={inputClass}
                onChange={(event) => {
                  setDraft(
                    changeMatchScore(
                      draft,
                      match.seriesBestOf,
                      event.target.value
                    )
                  );
                  setState(initialState);
                }}
              >
                <option value="">{t("resultUx.chooseScore")}</option>
                {getPerspectiveScores(match.seriesBestOf, draft.outcome).map(
                  (score) => (
                    <option key={score.value} value={score.value}>
                      {score.viewerScore}–{score.opponentScore}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>
          {result && (
            <div className="space-y-3">
              <p className="text-xs leading-5 text-zinc-400">
                {t("resultUx.replayHint")}
              </p>
              {draft.games.map((game, index) => {
                const error = replayError(game.replay);
                const inferred = !game.winner && Boolean(games?.winners[index]);
                return (
                  <fieldset
                    key={index}
                    className="min-w-0 rounded-xl border border-white/15 bg-black/20 p-3 sm:p-4"
                  >
                    <legend className="px-1 text-xs font-black uppercase tracking-wide text-orange-200">
                      {t("resultUx.game", { number: index + 1 })}
                    </legend>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0 space-y-2">
                        <label
                          className={`${buttonClass} relative flex cursor-pointer items-center justify-center overflow-hidden text-zinc-200 focus-within:ring-2 focus-within:ring-orange-400`}
                        >
                          {t(
                            game.replay
                              ? "resultUx.replaceReplay"
                              : "resultUx.chooseReplay"
                          )}
                          <input
                            type="file"
                            accept=".rec"
                            aria-label={t("resultUx.gameReplay", {
                              number: index + 1,
                            })}
                            aria-invalid={Boolean(error)}
                            aria-describedby={`${id}-replay-${index}`}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              if (file) updateGame(index, { replay: file });
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <div
                          id={`${id}-replay-${index}`}
                          className="min-w-0 text-xs leading-5"
                        >
                          {game.replay && (
                            <p className="break-all text-zinc-200">
                              {game.replay.name}
                            </p>
                          )}
                          {error ? (
                            <p role="alert" className="text-red-300">
                              {error}
                            </p>
                          ) : (
                            game.replay && (
                              <p className="text-emerald-300">
                                {t("resultUx.replayAttached")}
                              </p>
                            )
                          )}
                        </div>
                        {game.replay && (
                          <button
                            type="button"
                            className={`${buttonClass} text-zinc-300`}
                            onClick={() => updateGame(index, { replay: null })}
                          >
                            {t("resultUx.removeReplay")}
                          </button>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-bold text-zinc-400">
                          {t("resultForm.gameWinnerLabel", { game: index + 1 })}
                        </p>
                        {inferred ? (
                          <p className="py-2 text-sm font-bold text-white">
                            {games?.winners[index] === viewerRegistrationId
                              ? t("resultUx.you")
                              : opponentName}
                            <span className="mt-1 block text-xs font-normal text-zinc-400">
                              {t("resultUx.derivedWinner")}
                            </span>
                          </p>
                        ) : (
                          <div
                            role="group"
                            aria-label={t("resultForm.gameWinnerLabel", {
                              game: index + 1,
                            })}
                            className="flex flex-wrap gap-2"
                          >
                            {[viewerRegistrationId, opponentId]
                              .filter((value): value is string =>
                                Boolean(value)
                              )
                              .map((registrationId) => (
                                <button
                                  key={registrationId}
                                  type="button"
                                  aria-pressed={game.winner === registrationId}
                                  disabled={
                                    !games?.choices[index].includes(
                                      registrationId
                                    ) || locked
                                  }
                                  className={`${buttonClass} max-w-full break-words ${game.winner === registrationId ? "border-orange-400 bg-orange-500/20 text-orange-100" : "text-zinc-300"}`}
                                  onClick={() =>
                                    updateGame(index, {
                                      winner:
                                        game.winner === registrationId
                                          ? ""
                                          : registrationId,
                                    })
                                  }
                                >
                                  {registrationId === viewerRegistrationId
                                    ? t("resultUx.you")
                                    : opponentName}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
          <details>
            <summary className="cursor-pointer py-3 text-sm text-zinc-300 focus-visible:outline focus-visible:outline-orange-400">
              {t("resultUx.addNote")}
            </summary>
            <label className="block">
              <span className="text-xs text-zinc-400">
                {t("resultForm.notesOptional")}
              </span>
              <textarea
                name="notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={`${inputClass} mt-2 resize-y`}
              />
            </label>
          </details>
        </fieldset>
        {ready && !pending && (
          <div className="space-y-2 rounded-xl border border-orange-400/25 bg-orange-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-orange-200">
              {t("resultUx.summary")}
            </p>
            <p className="break-words font-bold text-white">{summary}</p>
            <p className="text-xs text-zinc-300">
              {t("resultUx.filesAttached", {
                count: draft.games.length,
                total: draft.games.length,
              })}
            </p>
            <p className="text-xs leading-5 text-zinc-400">
              {t("resultUx.afterSubmit")}
            </p>
          </div>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-300">
            {getMatchActionMessage(state, t)}
          </p>
        )}
        <button
          type="submit"
          disabled={!ready || locked}
          className="min-h-12 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:opacity-40"
        >
          {pending ? progress : t("resultUx.submit")}
        </button>
      </form>
      {!pending && (
        <details className="border-t border-white/10 pt-2">
          <summary className="cursor-pointer py-3 text-sm text-zinc-400 focus-visible:outline focus-visible:outline-orange-400">
            {t("resultUx.noShow")}
          </summary>
          <form action={noShowAction} className="mt-2 space-y-3">
            <input type="hidden" name="matchId" value={match.id} />
            <fieldset disabled={locked} className="space-y-3">
              <label className="block text-xs text-zinc-300">
                {t("resultForm.missingPlayer")}
                <select
                  name="noShowRegistrationId"
                  defaultValue=""
                  required
                  className={`${inputClass} mt-2`}
                >
                  <option value="">{t("resultForm.selectOpponent")}</option>
                  <option value={match.playerOneRegistrationId ?? ""}>
                    {playerOneName}
                  </option>
                  <option value={match.playerTwoRegistrationId ?? ""}>
                    {playerTwoName}
                  </option>
                </select>
              </label>
              <label className="block text-xs text-zinc-300">
                {t("resultForm.evidenceOptional")}
                <textarea
                  name="noShowNotes"
                  maxLength={2000}
                  rows={3}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <p className="text-xs leading-5 text-orange-200">
                {t("resultForm.noShowWarning")}
              </p>
              {noShowState.status !== "idle" && (
                <p role="status" className="text-sm text-orange-200">
                  {getMatchActionMessage(noShowState, t)}
                </p>
              )}
              <button
                type="submit"
                className={`${buttonClass} w-full text-orange-200`}
              >
                {t(
                  noShowPending
                    ? "resultForm.submitting"
                    : "resultForm.submitNoShow"
                )}
              </button>
            </fieldset>
          </form>
        </details>
      )}
    </div>
  );
}
