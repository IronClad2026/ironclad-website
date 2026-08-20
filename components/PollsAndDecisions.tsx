"use client";

import { useAuth } from "@clerk/nextjs";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Crown,
  Info,
  ShieldCheck,
  Vote,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  castPollBallot as castPollBallotAction,
  type PollBallotActionResult,
} from "@/app/polls/actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import InfoTooltip from "@/components/InfoTooltip";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import {
  parseSinglePollProjection,
  type PollOptionProjection,
  type PollViewerProjection,
  type SubmitPollVoteInput,
} from "@/lib/polls";
import { createAuthenticatedBrowserSupabaseClient } from "@/lib/supabase-browser";

export type PollSurface = "tournament" | "community";
export type PollLoadResult =
  | { ok: true; polls: PollViewerProjection[] }
  | { ok: false; message: string };

export type PollsAndDecisionsProps = {
  surface: PollSurface;
  initialPolls: PollViewerProjection[];
  initialError?: string | null;
  tournamentId?: string;
  highlightedPollId?: string | null;
  presentation?: "desktop" | "mobile";
  pollIntervalMs?: number;
  loadPolls?: (signal?: AbortSignal) => Promise<PollLoadResult>;
  castBallot?: (
    input: SubmitPollVoteInput
  ) => Promise<PollBallotActionResult>;
};

const DEFAULT_POLL_INTERVAL_MS = 7_000;
const MAX_TIMER_MS = 2_147_000_000;

type PollMessage = {
  text: string;
  role: "status" | "alert";
};

function isVisibleAndOnline() {
  return (
    document.visibilityState !== "hidden" &&
    (typeof navigator === "undefined" || navigator.onLine !== false)
  );
}

function getInitialViewportActivity(
  presentation: PollsAndDecisionsProps["presentation"]
) {
  if (!presentation || typeof window === "undefined") {
    return presentation === undefined;
  }
  if (typeof window.matchMedia !== "function") return true;
  const desktop = window.matchMedia("(min-width: 1024px)").matches;
  return presentation === "desktop" ? desktop : !desktop;
}

export default function PollsAndDecisions({
  surface,
  initialPolls,
  initialError = null,
  highlightedPollId = null,
  presentation,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  loadPolls,
  castBallot = castPollBallotAction,
}: PollsAndDecisionsProps) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const { getToken, isSignedIn } = useAuth();
  const headingId = useId();
  const [polls, setPolls] = useState(initialPolls);
  const [draftSelections, setDraftSelections] = useState<
    Record<string, string[]>
  >(() => buildInitialSelections(initialPolls));
  const [messages, setMessages] = useState<Record<string, PollMessage | null>>(
    {}
  );
  const [pendingPollId, setPendingPollId] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(
    initialError ? t("polls.refreshError") : null
  );
  const [viewportActive, setViewportActive] = useState(() =>
    getInitialViewportActivity(presentation)
  );
  const [isPending, startTransition] = useTransition();
  const mountedRef = useRef(false);
  const viewportWasActiveRef = useRef(viewportActive);
  const pollsRef = useRef(initialPolls);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const failureCountRef = useRef(0);
  const dirtyPollsRef = useRef(new Set<string>());
  const pollCardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!presentation || typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () =>
      setViewportActive(presentation === "desktop" ? query.matches : !query.matches);
    const initialTimer = window.setTimeout(apply, 0);
    query.addEventListener("change", apply);
    return () => {
      window.clearTimeout(initialTimer);
      query.removeEventListener("change", apply);
    };
  }, [presentation]);

  const browserClient = useMemo(
    () =>
      loadPolls === undefined && typeof window !== "undefined"
        ? createAuthenticatedBrowserSupabaseClient(getToken)
        : null,
    [getToken, loadPolls]
  );

  const loadFromDatabase = useCallback(
    async (signal?: AbortSignal): Promise<PollLoadResult> => {
      if (!browserClient) {
        return { ok: false, message: t("polls.refreshError") };
      }

      if (!isSignedIn) return { ok: true, polls: pollsRef.current };

      const targets = pollsRef.current.filter(
        (poll) =>
          typeof poll.ballotRevision === "number" &&
          (poll.status === "open" || poll.status === "scheduled")
      );
      if (targets.length === 0) {
        return { ok: true, polls: pollsRef.current };
      }

      const refreshed = await Promise.all(
        targets.map(async (poll) => {
          const query = browserClient.rpc("get_my_poll", {
            p_poll_id: poll.id,
          });
          if (signal) query.abortSignal(signal);
          const { data, error } = await query;
          return error ? null : parseSinglePollProjection(data, "viewer");
        })
      );
      if (refreshed.some((poll) => poll === null)) {
        return { ok: false, message: t("polls.refreshError") };
      }

      const merged = new Map(pollsRef.current.map((poll) => [poll.id, poll]));
      for (const poll of refreshed) {
        if (poll) merged.set(poll.id, poll);
      }
      return { ok: true, polls: [...merged.values()] };
    }, [browserClient, isSignedIn, t]
  );

  const performLoad = loadPolls ?? loadFromDatabase;

  const applyPolls = useCallback((nextPolls: PollViewerProjection[]) => {
    if (!mountedRef.current) return;
    pollsRef.current = nextPolls;
    setPolls(nextPolls);
    setDraftSelections((current) =>
      mergeAuthoritativeSelections(current, nextPolls, dirtyPollsRef.current)
    );
  }, []);

  const refreshPolls = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (
        !mountedRef.current ||
        !viewportActive ||
        (!force && !isVisibleAndOnline())
      ) {
        return null;
      }

      if (inFlightRef.current) {
        if (!force) return null;
        controllerRef.current?.abort();
      }

      const mutationRevision = mutationRevisionRef.current;
      const sequence = ++sequenceRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      inFlightRef.current = true;

      try {
        const result = await performLoad(controller.signal);
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          mutationRevision !== mutationRevisionRef.current ||
          sequence < appliedSequenceRef.current
        ) {
          return null;
        }

        appliedSequenceRef.current = sequence;
        if (!result.ok) {
          failureCountRef.current = Math.min(failureCountRef.current + 1, 3);
          setRefreshMessage(t("polls.refreshError"));
          return false;
        }

        failureCountRef.current = 0;
        setRefreshMessage(null);
        applyPolls(result.polls);
        return true;
      } catch {
        if (!controller.signal.aborted && mountedRef.current) {
          failureCountRef.current = Math.min(failureCountRef.current + 1, 3);
          setRefreshMessage(t("polls.refreshError"));
        }
        return false;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          inFlightRef.current = false;
        }
      }
    }, [applyPolls, performLoad, t, viewportActive]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const wasActive = viewportWasActiveRef.current;
    viewportWasActiveRef.current = viewportActive;
    if (!wasActive && viewportActive && isVisibleAndOnline()) {
      void refreshPolls();
    }
  }, [refreshPolls, viewportActive]);

  const hasOpenLivePoll = polls.some(
    (poll) => poll.status === "open" && poll.resultVisibility === "live"
  );

  useEffect(() => {
    if (!viewportActive || !hasOpenLivePoll) return;

    let timer: number | null = null;
    let stopped = false;
    const schedule = () => {
      if (stopped) return;
      const delay = pollIntervalMs * (failureCountRef.current + 1);
      timer = window.setTimeout(async () => {
        await refreshPolls();
        schedule();
      }, delay);
    };
    schedule();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [hasOpenLivePoll, pollIntervalMs, refreshPolls, viewportActive]);

  useEffect(() => {
    if (!viewportActive) return;
    const delay = getNextBoundaryDelay(polls);
    if (delay === null) return;
    let timer: number | null = null;
    let stopped = false;
    const schedule = (wait: number) => {
      timer = window.setTimeout(async () => {
        const refreshed = await refreshPolls();
        if (!stopped && refreshed === false) {
          schedule(pollIntervalMs * (failureCountRef.current + 1));
        }
      }, Math.min(wait, MAX_TIMER_MS));
    };
    schedule(delay);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pollIntervalMs, polls, refreshPolls, viewportActive]);

  useEffect(() => {
    if (!viewportActive) return;
    const refreshIfAvailable = () => {
      if (isVisibleAndOnline()) void refreshPolls();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") refreshIfAvailable();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshIfAvailable);
    window.addEventListener("pageshow", refreshIfAvailable);
    window.addEventListener("online", refreshIfAvailable);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshIfAvailable);
      window.removeEventListener("pageshow", refreshIfAvailable);
      window.removeEventListener("online", refreshIfAvailable);
    };
  }, [refreshPolls, viewportActive]);

  useEffect(() => {
    if (!highlightedPollId || !viewportActive) return;
    window.requestAnimationFrame(() => {
      pollCardRefs.current.get(highlightedPollId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [highlightedPollId, viewportActive]);

  const orderedPolls = useMemo(() => [...polls].sort(comparePolls), [polls]);

  const toggleOption = (
    poll: PollViewerProjection,
    optionId: string,
    checked: boolean
  ) => {
    setMessages((current) => ({ ...current, [poll.id]: null }));
    dirtyPollsRef.current.add(poll.id);
    setDraftSelections((current) => {
      const selected = current[poll.id] ?? poll.selectedOptionIds ?? [];
      if (poll.maxSelections === 1) {
        return { ...current, [poll.id]: checked ? [optionId] : [] };
      }
      const next = checked
        ? [...selected, optionId]
        : selected.filter((candidate) => candidate !== optionId);
      return {
        ...current,
        [poll.id]: [...new Set(next)].slice(0, poll.maxSelections),
      };
    });
  };

  const submitBallot = (poll: PollViewerProjection) => {
    if (pendingPollId || isPending || typeof poll.ballotRevision !== "number") {
      return;
    }
    const selectedOptionIds = draftSelections[poll.id] ?? [];
    if (selectedOptionIds.length < 1) return;

    setPendingPollId(poll.id);
    setMessages((current) => ({
      ...current,
      [poll.id]: { text: t("polls.savingBallot"), role: "status" },
    }));
    startTransition(async () => {
      const result = await castBallot({
        pollId: poll.id,
        expectedRevision: poll.ballotRevision as number,
        selectedOptionIds,
      });
      if (!result.ok) {
        setMessages((current) => ({
          ...current,
          [poll.id]: {
            text:
              result.code === "auth_required"
                ? t("actionResults.authRequired")
                : result.code === "invalid_request"
                  ? t("pollAction.invalid")
                  : t("pollAction.failed"),
            role: "alert",
          },
        }));
        setPendingPollId(null);
        await refreshPolls({ force: true });
        return;
      }

      mutationRevisionRef.current += 1;
      dirtyPollsRef.current.delete(poll.id);
      setPolls((current) => {
        const next = current.map((candidate) =>
          candidate.id === poll.id
            ? {
                ...candidate,
                ballotRevision: result.data.ballotRevision,
                selectedOptionIds: result.data.selectedOptionIds,
              }
            : candidate
        );
        pollsRef.current = next;
        return next;
      });
      setDraftSelections((current) => ({
        ...current,
        [poll.id]: result.data.selectedOptionIds,
      }));
      setMessages((current) => ({
        ...current,
        [poll.id]: {
          text: result.data.idempotent
            ? t("polls.ballotConfirmed")
            : t("polls.ballotSaved"),
          role: "status",
        },
      }));
      setPendingPollId(null);
      await refreshPolls({ force: true });
    });
  };

  const heading =
    surface === "community"
      ? t("polls.communityTitle")
      : t("polls.tournamentTitle");
  const description =
    surface === "community"
      ? t("polls.communityDescription")
      : t("polls.tournamentDescription");

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 border border-orange-500/20 bg-black/65 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
    >
      <header className="flex min-w-0 flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
            {surface === "community"
              ? t("polls.communityEyebrow")
              : t("polls.tournamentEyebrow")}
          </p>
          <h2
            id={headingId}
            className="mt-2 break-words text-2xl font-black uppercase text-white sm:text-3xl"
          >
            {heading}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {description}
          </p>
        </div>
        <Vote aria-hidden="true" className="h-8 w-8 shrink-0 text-orange-400" />
      </header>

      {refreshMessage && (
        <p role="alert" className="mt-4 border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {refreshMessage}
        </p>
      )}

      {orderedPolls.length === 0 ? (
        <div className="mt-5 border border-white/10 bg-black/35 p-6 text-sm leading-6 text-zinc-400">
          {surface === "community"
            ? t("polls.communityEmpty")
            : t("polls.tournamentEmpty")}
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-5">
          {orderedPolls.map((poll) => {
            const selected = draftSelections[poll.id] ?? poll.selectedOptionIds ?? [];
            return (
              <PollCard
                key={poll.id}
                poll={poll}
                selectedOptionIds={selected}
                pending={pendingPollId === poll.id}
                message={messages[poll.id] ?? null}
                highlighted={poll.id === highlightedPollId}
                setRef={(node) => {
                  if (node) pollCardRefs.current.set(poll.id, node);
                  else pollCardRefs.current.delete(poll.id);
                }}
                onToggle={(optionId, checked) =>
                  toggleOption(poll, optionId, checked)
                }
                onSubmit={() => submitBallot(poll)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function PollCard({
  poll,
  selectedOptionIds,
  pending,
  message,
  highlighted,
  setRef,
  onToggle,
  onSubmit,
}: {
  poll: PollViewerProjection;
  selectedOptionIds: string[];
  pending: boolean;
  message: PollMessage | null;
  highlighted: boolean;
  setRef: (node: HTMLElement | null) => void;
  onToggle: (optionId: string, checked: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const locale = useOptionalLocale();
  const radioGroupName = useId();
  const canVote = poll.status === "open" && typeof poll.ballotRevision === "number";
  const hasSavedBallot = (poll.selectedOptionIds?.length ?? 0) > 0;
  const unchanged = sameOptionSet(selectedOptionIds, poll.selectedOptionIds ?? []);
  const showTotals =
    !(poll.status === "open" && poll.resultVisibility === "after_close") &&
    poll.options.every(
      (option) =>
        typeof option.voteCount === "number" &&
        typeof option.selectionSharePercent === "number"
    );
  const pollResult = getPollResultOptions(poll);
  const finalDecision = poll.options
    .filter((option) => option.finalDecisionRank !== null)
    .sort(
      (left, right) =>
        (left.finalDecisionRank ?? Number.MAX_SAFE_INTEGER) -
        (right.finalDecisionRank ?? Number.MAX_SAFE_INTEGER)
    );

  return (
    <article
      ref={setRef}
      aria-label={poll.question}
      className={`min-w-0 border p-4 sm:p-5 ${
        highlighted
          ? "border-orange-300 bg-orange-500/10 shadow-[0_0_28px_rgba(249,115,22,0.18)]"
          : "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(4,4,4,0.82))]"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge>
          {poll.authority === "binding"
            ? t("polls.binding")
            : t("polls.advisory")}
        </Badge>
        <InfoTooltip
          align="start"
          label={t("polls.aboutAuthority", {
            authority:
              poll.authority === "binding"
                ? t("polls.binding")
                : t("polls.advisory"),
          })}
          content={
            poll.authority === "binding"
              ? t("polls.bindingHelp")
              : t("polls.advisoryHelp")
          }
        />
        <Badge>{formatStatus(poll.status, t)}</Badge>
        {poll.maxSelections > 1 && (
          <Badge>{t("polls.chooseUpTo", { count: poll.maxSelections })}</Badge>
        )}
        {poll.winnerCount > 1 && (
          <Badge>{t("polls.winnerCount", { count: poll.winnerCount })}</Badge>
        )}
      </div>

      <h3 className="mt-4 break-words text-xl font-black text-white sm:text-2xl">
        {poll.question}
      </h3>
      {poll.context && (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
          {poll.context}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-orange-400" />
          <LocalizedPollDateTime
            message={t(
              poll.status === "scheduled"
                ? "pollDates.opensAt"
                : "pollDates.closesAt",
              { date: "__DATE__" }
            )}
            value={poll.status === "scheduled" ? poll.opensAt : poll.closesAt}
            fallback={t("dice.timeUnavailable")}
          />
        </span>
        {typeof poll.submittedBallotCount === "number" && (
          <span>
            {typeof poll.eligibleCount === "number"
              ? t("pollCounts.ballotEligibility", {
                  ballots: formatPollCount(
                    "ballotCount",
                    poll.submittedBallotCount,
                    locale,
                    t
                  ),
                  eligible: t("polls.eligibleCount", {
                    count: formatNumber(poll.eligibleCount, locale),
                  }),
                })
              : formatPollCount(
                  "ballotCount",
                  poll.submittedBallotCount,
                  locale,
                  t
                )}
          </span>
        )}
        {poll.status === "final_decision_published" &&
          poll.finalDecisionPublishedAt && (
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
              <LocalizedPollDateTime
                message={t("pollDates.decisionPublishedAt", {
                  date: "__DATE__",
                })}
                value={poll.finalDecisionPublishedAt}
                fallback={t("dice.timeUnavailable")}
              />
            </span>
          )}
      </div>

      {poll.authority === "binding" && poll.status === "open" && (
        <p className="mt-4 border border-orange-400/25 bg-orange-500/10 p-3 text-xs font-bold leading-5 text-orange-100">
          {t("polls.bindingTurnout")}
        </p>
      )}

      {canVote ? (
        <fieldset className="mt-5 min-w-0" disabled={pending}>
          <legend className="sr-only">{poll.question}</legend>
          {showTotals && poll.maxSelections > 1 && (
            <p className="mb-3 text-xs leading-5 text-zinc-500">
              {t("polls.percentageHelp")}
            </p>
          )}
          <div className="grid min-w-0 gap-2">
            {poll.options.map((option) => {
              const checked = selectedOptionIds.includes(option.id);
              const atLimit = selectedOptionIds.length >= poll.maxSelections;
              return (
                <label
                  key={option.id}
                  className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-3 border px-3 py-2.5 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-300 ${
                    checked
                      ? "border-orange-400/65 bg-orange-500/15 text-white"
                      : "border-white/10 bg-black/35 text-zinc-300 hover:border-orange-400/40"
                  }`}
                >
                  <input
                    type={poll.maxSelections === 1 ? "radio" : "checkbox"}
                    name={poll.maxSelections === 1 ? radioGroupName : undefined}
                    aria-label={option.map?.name ?? option.label}
                    checked={checked}
                    disabled={pending || (!checked && atLimit)}
                    onChange={(event) => onToggle(option.id, event.target.checked)}
                    className="h-4 w-4 shrink-0 accent-orange-500"
                  />
                  <span className="min-w-0 flex-1 break-words text-sm font-bold">
                    {option.map?.name ?? option.label}
                  </span>
                  {showTotals && (
                    <OptionAggregate option={option} multi={poll.maxSelections > 1} />
                  )}
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-zinc-400">
              {t("polls.selectedMaximum", {
                selected: selectedOptionIds.length,
                maximum: poll.maxSelections,
              })}
            </p>
            <button
              type="button"
              onClick={onSubmit}
              disabled={
                pending ||
                selectedOptionIds.length < 1 ||
                selectedOptionIds.length > poll.maxSelections ||
                unchanged
              }
              className="min-h-11 border border-orange-400 bg-orange-500 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {pending
                ? t("polls.saving")
                : hasSavedBallot
                  ? t("polls.updateVote")
                  : t("polls.submitVote")}
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {t("polls.changeUntilClose")}
          </p>
        </fieldset>
      ) : (
        <PollResults poll={poll} showTotals={showTotals} />
      )}

      {canVote && !showTotals && poll.resultVisibility === "after_close" && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-zinc-400">
          <ShieldCheck className="h-4 w-4 text-orange-400" />
          {t("polls.afterClose")}
        </p>
      )}

      {poll.status === "final_decision_published" && (
        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
          <DecisionList
            title={t("polls.resultTitle")}
            options={pollResult}
            rank="poll"
          />
          <DecisionList
            title={
              poll.authority === "advisory"
                ? t("polls.adminFinalDecision")
                : t("polls.authoritativeDecision")
            }
            options={finalDecision}
            rank="final"
          />
        </div>
      )}

      {poll.finalRationale && poll.status === "final_decision_published" && (
        <div className="mt-4 border border-white/10 bg-black/35 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-orange-300">
            {t("polls.finalRationale")}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
            {poll.finalRationale}
          </p>
        </div>
      )}

      {poll.authority === "binding" &&
        poll.status === "final_decision_published" && (
        <p className="mt-4 inline-flex items-start gap-2 text-xs leading-5 text-zinc-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
          {t("polls.cutoffRule")} {poll.bindingTieRuleUsed
            ? t("polls.tieUsed")
            : t("polls.tieNotNeeded")}
        </p>
      )}

      {poll.status === "cancelled" && (
        <p className="mt-5 inline-flex items-start gap-2 border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {poll.cancellationReason || t("polls.cancelled")}
        </p>
      )}

      {message && (
        <p
          role={message.role}
          className="mt-4 border border-white/10 bg-black/35 p-3 text-sm font-bold text-zinc-200"
        >
          {message.text}
        </p>
      )}
    </article>
  );
}

function PollResults({
  poll,
  showTotals,
}: {
  poll: PollViewerProjection;
  showTotals: boolean;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);

  if (!showTotals) {
    return (
      <p className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-400">
        <ShieldCheck className="h-4 w-4 text-orange-400" />
        {poll.status === "scheduled"
          ? t("polls.notOpen")
          : poll.status === "open"
            ? t("polls.afterClose")
            : t("polls.aggregatesNotPublished")}
      </p>
    );
  }

  return (
    <div className="mt-5" aria-label={t("polls.aggregateAria")}>
      <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-300">
        <BarChart3 className="h-4 w-4" /> {t("polls.aggregateTitle")}
      </p>
      {poll.maxSelections > 1 && (
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {t("polls.percentageHelp")}
        </p>
      )}
      <div className="mt-3 grid min-w-0 gap-2">
        {poll.options.map((option) => (
          <div
            key={option.id}
            className="flex min-h-11 min-w-0 items-center gap-3 border border-white/10 bg-black/35 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 break-words text-sm font-bold text-zinc-200">
              {option.map?.name ?? option.label}
            </span>
            <OptionAggregate option={option} multi={poll.maxSelections > 1} />
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionAggregate({
  option,
  multi,
}: {
  option: PollOptionProjection;
  multi: boolean;
}) {
  const locale = useOptionalLocale();
  const t = useOptionalTranslations("competition", competitionEnglish);
  const voteCount = option.voteCount ?? 0;

  return (
    <span className="shrink-0 text-right text-xs font-bold text-zinc-400">
      <span className="block text-sm text-white">
        {formatPollCount("voteCount", voteCount, locale, t)}
      </span>
      <span>
        {multi
          ? t("polls.ballotShare", {
              percentage: formatPercentage(
                option.selectionSharePercent,
                locale
              ),
            })
          : formatPercentage(option.selectionSharePercent, locale)}
      </span>
    </span>
  );
}

function DecisionList({
  title,
  options,
  rank,
}: {
  title: string;
  options: PollOptionProjection[];
  rank: "poll" | "final";
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);

  return (
    <section className="min-w-0 border border-white/10 bg-black/35 p-4">
      <h4 className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-300">
        {rank === "final" ? <Crown className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {title}
      </h4>
      {options.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {options.map((option, index) => (
            <li key={option.id} className="break-words text-sm font-bold text-white">
              {rank === "poll"
                ? option.pollResultRank ?? index + 1
                : option.finalDecisionRank ?? index + 1}
              . {option.map?.name ?? option.label}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          {t("polls.noOutcome")}
        </p>
      )}
    </section>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="border border-orange-400/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
      {children}
    </span>
  );
}

function formatStatus(
  status: PollViewerProjection["status"],
  t: ReturnType<typeof useOptionalTranslations>
) {
  if (status === "final_decision_published") {
    return t("polls.decisionPublished");
  }

  const labels = {
    draft: t("polls.statusDraft"),
    scheduled: t("polls.statusScheduled"),
    open: t("polls.statusOpen"),
    closed: t("polls.statusClosed"),
    cancelled: t("polls.statusCancelled"),
  } as const;

  return labels[status];
}

function formatPollCount(
  key: "ballotCount" | "voteCount",
  count: number,
  locale: ReturnType<typeof useOptionalLocale>,
  t: ReturnType<typeof useOptionalTranslations>
) {
  const category = selectPlural(count, locale);
  const suffix = `${category[0].toUpperCase()}${category.slice(1)}`;
  return t(`pollCounts.${key}${suffix}`, {
    count: formatNumber(count, locale),
  });
}

function LocalizedPollDateTime({
  message,
  value,
  fallback,
}: {
  message: string;
  value: string;
  fallback: string;
}) {
  const [before, after = ""] = message.split("__DATE__");
  return (
    <>
      {before}
      <HydrationSafeLocalDateTime value={value} fallback={fallback} />
      {after}
    </>
  );
}

function formatPercentage(
  value: number | undefined,
  locale: ReturnType<typeof useOptionalLocale>
) {
  if (typeof value !== "number") return "—";
  return `${formatNumber(value, locale, { maximumFractionDigits: 1 })}%`;
}

function getPollResultOptions(poll: PollViewerProjection) {
  return poll.options
    .filter((option) => typeof option.pollResultRank === "number")
    .sort(
      (left, right) =>
        (left.pollResultRank ?? Number.MAX_SAFE_INTEGER) -
          (right.pollResultRank ?? Number.MAX_SAFE_INTEGER) ||
        left.position - right.position
    );
}

function comparePolls(left: PollViewerProjection, right: PollViewerProjection) {
  const rank = (poll: PollViewerProjection) => {
    if (poll.status === "open") {
      return (poll.selectedOptionIds?.length ?? 0) > 0 ? 1 : 0;
    }
    if (poll.status === "scheduled") return 2;
    if (poll.status === "closed") return 3;
    if (poll.status === "final_decision_published") return 4;
    if (poll.status === "cancelled") return 5;
    return 6;
  };
  return rank(left) - rank(right) || Date.parse(left.closesAt) - Date.parse(right.closesAt);
}

function buildInitialSelections(polls: PollViewerProjection[]) {
  return Object.fromEntries(
    polls.map((poll) => [poll.id, [...(poll.selectedOptionIds ?? [])]])
  );
}

function mergeAuthoritativeSelections(
  current: Record<string, string[]>,
  polls: PollViewerProjection[],
  dirtyPolls: Set<string>
) {
  const next = { ...current };
  for (const poll of polls) {
    if (!dirtyPolls.has(poll.id)) {
      next[poll.id] = [...(poll.selectedOptionIds ?? [])];
    }
  }
  return next;
}

function sameOptionSet(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((optionId) => right.includes(optionId))
  );
}

function getNextBoundaryDelay(polls: PollViewerProjection[]) {
  const now = Date.now();
  const futureBoundaries = polls
    .flatMap((poll) => {
      if (poll.status === "scheduled") return [Date.parse(poll.opensAt)];
      if (poll.status === "open") return [Date.parse(poll.closesAt)];
      return [];
    })
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= now)
    .sort((left, right) => left - right);
  return futureBoundaries.length > 0 ? Math.max(0, futureBoundaries[0] - now) : null;
}
