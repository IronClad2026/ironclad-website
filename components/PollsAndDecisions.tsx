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
  isPollListSnapshotComplete,
  mergePollListSnapshot,
  parsePollListSnapshot,
  projectPollListSnapshot,
  type PollListSnapshot,
  type PollSurface,
} from "@/lib/poll-loading";
import {
  type PollOptionProjection,
  type PollViewerProjection,
  type SubmitPollVoteInput,
} from "@/lib/polls";

export type { PollSurface } from "@/lib/poll-loading";
export type PollLoadResult =
  | { ok: true; polls: PollViewerProjection[]; snapshot?: PollListSnapshot }
  | { ok: false; message: string; snapshot?: PollListSnapshot; resetPrivate?: boolean };

export type PollsAndDecisionsProps = {
  surface: PollSurface;
  initialPolls: PollViewerProjection[];
  initialError?: string | null;
  initialSnapshot?: PollListSnapshot;
  tournamentId?: string;
  highlightedPollId?: string | null;
  presentation?: "desktop" | "mobile";
  density?: "default" | "compact";
  pollIntervalMs?: number;
  loadPolls?: (signal?: AbortSignal) => Promise<PollLoadResult>;
  castBallot?: (
    input: SubmitPollVoteInput
  ) => Promise<PollBallotActionResult>;
};

const DEFAULT_POLL_INTERVAL_MS = 7_000;
const MAX_TIMER_MS = 2_147_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_AUTOMATIC_FAILURES = 3;

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

export default function PollsAndDecisions(props: PollsAndDecisionsProps) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const authReady = isLoaded !== false;
  const viewerUserId = authReady && isSignedIn ? userId ?? null : null;
  const viewerSessionId = authReady && isSignedIn ? sessionId ?? null : null;
  const [initialLegacyContext] = useState({ userId: viewerUserId, sessionId: viewerSessionId });

  // A new Clerk session owns a new controller, drafts and response generation.
  // In particular, old server props must never seed another account's state.
  return (
    <PollsAndDecisionsSession
      key={JSON.stringify([
        props.surface,
        props.tournamentId ?? null,
        authReady,
        viewerUserId,
        viewerSessionId,
      ])}
      {...props}
      authReady={authReady}
      viewerUserId={viewerUserId}
      viewerSessionId={viewerSessionId}
      allowLegacyInitial={authReady &&
        initialLegacyContext.userId === viewerUserId &&
        initialLegacyContext.sessionId === viewerSessionId}
    />
  );
}

function PollsAndDecisionsSession({
  surface,
  initialPolls,
  initialError = null,
  initialSnapshot,
  tournamentId,
  highlightedPollId = null,
  presentation,
  density = "default",
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  loadPolls,
  castBallot = castPollBallotAction,
  authReady,
  viewerUserId,
  viewerSessionId,
  allowLegacyInitial,
}: PollsAndDecisionsProps & {
  authReady: boolean;
  viewerUserId: string | null;
  viewerSessionId: string | null;
  allowLegacyInitial: boolean;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const headingId = useId();
  const [seed] = useState(() => createInitialPollState({
    initialSnapshot,
    initialPolls,
    initialError,
    surface,
    tournamentId: tournamentId ?? null,
    viewerUserId,
    viewerSessionId,
    authReady,
    allowLegacyInitial,
  }));
  const [polls, setPolls] = useState(seed.polls);
  const [draftSelections, setDraftSelections] = useState<
    Record<string, string[]>
  >(() => buildInitialSelections(seed.polls));
  const [messages, setMessages] = useState<Record<string, PollMessage | null>>(
    {}
  );
  const [pendingPollId, setPendingPollId] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(
    seed.needsRecovery ? t("polls.refreshError") : null
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [accountState, setAccountState] = useState(seed.snapshot?.accountState);
  const [viewportActive, setViewportActive] = useState(() =>
    getInitialViewportActivity(presentation)
  );
  const [isPending, startTransition] = useTransition();
  const mountedRef = useRef(false);
  const viewportWasActiveRef = useRef(viewportActive);
  const pollsRef = useRef(seed.polls);
  const snapshotRef = useRef(seed.snapshot);
  const lastInitialSnapshotRef = useRef(initialSnapshot);
  const initialRequestPendingRef = useRef(seed.needsRecovery);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const mutationPendingRef = useRef(false);
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

  const loadFromServer = useCallback(
    async (signal?: AbortSignal): Promise<PollLoadResult> => {
      const params = new URLSearchParams({ surface });
      if (surface === "tournament" && tournamentId) {
        params.set("tournamentId", tournamentId);
      }
      const response = await fetch(`/api/polls?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) {
        return { ok: false, message: t("polls.refreshError") };
      }
      const snapshot = parsePollListSnapshot(
        await response.json(),
        surface,
        tournamentId ?? null
      );
      if (!snapshot) {
        return { ok: false, message: t("polls.refreshError") };
      }
      if (!matchesViewer(snapshot, viewerUserId, viewerSessionId)) {
        // Public data is independent of the failed/changed session. Never adopt
        // its private half, but allow a missing public list to recover now.
        return {
          ok: false,
          message: t("polls.refreshError"),
          resetPrivate: true,
          snapshot: {
            ...snapshot,
            private: { status: "unavailable" },
            accountState: "unavailable",
            viewerContext: { userId: viewerUserId, sessionId: viewerSessionId },
          },
        };
      }
      return isPollListSnapshotComplete(snapshot)
        ? { ok: true, polls: projectPollListSnapshot(snapshot), snapshot }
        : { ok: false, message: t("polls.refreshError"), snapshot };
    }, [surface, tournamentId, viewerUserId, viewerSessionId, t]
  );

  const performLoad = loadPolls ?? loadFromServer;

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
        !authReady ||
        !viewportActive ||
        mutationPendingRef.current ||
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
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const result = await performLoad(controller.signal);
        if (
          (controller.signal.aborted && !timedOut) ||
          !mountedRef.current ||
          mutationRevision !== mutationRevisionRef.current ||
          sequence < appliedSequenceRef.current
        ) {
          return null;
        }

        appliedSequenceRef.current = sequence;
        if (!timedOut && result && !result.ok && result.resetPrivate) {
          const current = snapshotRef.current;
          snapshotRef.current = current ? {
            ...current,
            private: { status: "unavailable" },
            accountState: "unavailable",
          } : undefined;
          setAccountState("unavailable");
          applyPolls(snapshotRef.current ? projectPollListSnapshot(snapshotRef.current) : []);
        }
        if (!timedOut && result?.snapshot) {
          snapshotRef.current = mergePollListSnapshot(result.snapshot, snapshotRef.current);
          setAccountState(result.snapshot.accountState);
          applyPolls(projectPollListSnapshot(snapshotRef.current));
        }
        if (timedOut || !result?.ok) {
          failureCountRef.current = Math.min(failureCountRef.current + 1, MAX_AUTOMATIC_FAILURES);
          setRefreshMessage(t("polls.refreshError"));
          return false;
        }

        failureCountRef.current = 0;
        setRefreshMessage(null);
        if (!result.snapshot) applyPolls(result.polls);
        return true;
      } catch {
        if ((!controller.signal.aborted || timedOut) && mountedRef.current) {
          failureCountRef.current = Math.min(failureCountRef.current + 1, MAX_AUTOMATIC_FAILURES);
          setRefreshMessage(t("polls.refreshError"));
        }
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          inFlightRef.current = false;
          if (mountedRef.current) setRefreshVersion((version) => version + 1);
        }
      }
    }, [applyPolls, authReady, performLoad, t, viewportActive]
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
    if (initialSnapshot === lastInitialSnapshotRef.current) return;
    if (!initialSnapshot || !matchesViewer(initialSnapshot, viewerUserId, viewerSessionId)) return;
    // Router props may have been rendered before an in-flight ballot write.
    // They can invalidate this session, but only a new read may replace it.
    // A pending mutation already performs that read after it settles.
    const timer = window.setTimeout(() => {
      lastInitialSnapshotRef.current = initialSnapshot;
      if (isVisibleAndOnline()) void refreshPolls({ force: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSnapshot, refreshPolls, viewerUserId, viewerSessionId]);

  useEffect(() => {
    const wasActive = viewportWasActiveRef.current;
    viewportWasActiveRef.current = viewportActive;
    if (!viewportActive) {
      controllerRef.current?.abort();
    } else if (!wasActive && isVisibleAndOnline()) {
      initialRequestPendingRef.current = false;
      failureCountRef.current = 0;
      void refreshPolls();
    }
  }, [refreshPolls, viewportActive]);

  useEffect(() => {
    if (!authReady || !viewportActive || pendingPollId || failureCountRef.current >= MAX_AUTOMATIC_FAILURES) return;
    const hasOpenLivePoll = polls.some(
      (poll) => poll.status === "open" && poll.resultVisibility === "live"
    );
    const intervalDelay = Math.max(1_000, pollIntervalMs) * (failureCountRef.current + 1);
    const boundaryDelay = getNextBoundaryDelay(polls);
    const delays = [
      initialRequestPendingRef.current ? 0 : null,
      hasOpenLivePoll || refreshMessage ? intervalDelay : null,
      refreshMessage ? null : boundaryDelay,
    ].filter((delay): delay is number => delay !== null);
    if (delays.length === 0) return;
    // One timer handles live polling, clock boundaries and bounded recovery.
    const timer = window.setTimeout(() => {
      initialRequestPendingRef.current = false;
      void refreshPolls();
    }, Math.min(...delays, MAX_TIMER_MS));
    return () => window.clearTimeout(timer);
  }, [authReady, pendingPollId, pollIntervalMs, polls, refreshMessage, refreshPolls, refreshVersion, viewportActive]);

  useEffect(() => {
    if (!viewportActive) return;
    const refreshIfAvailable = () => {
      if (isVisibleAndOnline()) {
        initialRequestPendingRef.current = false;
        failureCountRef.current = 0;
        void refreshPolls();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") controllerRef.current?.abort();
      else refreshIfAvailable();
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
    if (!authReady || pendingPollId || isPending || typeof poll.ballotRevision !== "number") {
      return;
    }
    const selectedOptionIds = draftSelections[poll.id] ?? [];
    if (selectedOptionIds.length < 1) return;

    mutationPendingRef.current = true;
    mutationRevisionRef.current += 1;
    controllerRef.current?.abort();
    setPendingPollId(poll.id);
    setMessages((current) => ({
      ...current,
      [poll.id]: { text: t("polls.savingBallot"), role: "status" },
    }));
    startTransition(async () => {
      let result: PollBallotActionResult;
      try {
        result = await castBallot({
          pollId: poll.id,
          expectedRevision: poll.ballotRevision as number,
          selectedOptionIds,
        });
      } catch {
        result = { ok: false, code: "save_failed", error: "" };
      }
      if (!mountedRef.current) return;
      mutationPendingRef.current = false;
      mutationRevisionRef.current += 1;
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

      dirtyPollsRef.current.delete(poll.id);
      const currentSnapshot = snapshotRef.current;
      if (currentSnapshot && currentSnapshot.private.status !== "not_applicable" && currentSnapshot.private.polls) {
        const privatePart = currentSnapshot.private;
        snapshotRef.current = {
          ...currentSnapshot,
          private: {
            ...privatePart,
            polls: currentSnapshot.private.polls.map((candidate) => candidate.id === poll.id
              ? { ...candidate, ballotRevision: result.data.ballotRevision, selectedOptionIds: result.data.selectedOptionIds }
              : candidate),
          },
        };
      }
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
  const compact = surface === "community" && density === "compact";

  return (
    <section
      aria-labelledby={headingId}
      data-poll-load-state={refreshMessage ? (polls.length > 0 ? "partial" : "unavailable") : (polls.length > 0 ? "populated" : "empty")}
      data-poll-account-state={accountState}
      className={compact
        ? "min-w-0 border border-white/12 bg-zinc-950/85 p-4 sm:p-5"
        : "min-w-0 border border-orange-500/20 bg-black/65 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"}
    >
      <header className={compact
        ? "flex min-w-0 items-start justify-between gap-3"
        : "flex min-w-0 flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between"}>
        <div className="min-w-0">
          <p className={compact ? "sr-only" : "text-xs font-black uppercase tracking-[0.28em] text-orange-400"}>
            {surface === "community"
              ? t("polls.communityEyebrow")
              : t("polls.tournamentEyebrow")}
          </p>
          <h2
            id={headingId}
            className={compact ? "break-words text-xl font-bold text-white sm:text-2xl" : "mt-2 break-words text-2xl font-black uppercase text-white sm:text-3xl"}
          >
            {heading}
          </h2>
          <p className={compact && orderedPolls.length === 0 ? "sr-only" : "mt-2 max-w-3xl text-sm leading-6 text-zinc-400"}>
            {description}
          </p>
        </div>
        <Vote aria-hidden="true" className={compact ? "h-5 w-5 shrink-0 text-zinc-400" : "h-8 w-8 shrink-0 text-orange-400"} />
      </header>

      {refreshMessage && (
        <p role="alert" className="mt-4 border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {refreshMessage}
        </p>
      )}

      {(accountState === "missing" || accountState === "closed") && (
        <p role="status" className="mt-4 border border-white/10 bg-black/35 p-3 text-sm leading-6 text-zinc-400">
          {accountState === "missing" ? t("polls.missingPlayer") : t("polls.closedPlayer")}
        </p>
      )}

      {orderedPolls.length === 0 && !refreshMessage && accountState !== "missing" && accountState !== "closed" ? (
        <div className={compact ? "mt-2 text-sm leading-6 text-zinc-400" : "mt-5 border border-white/10 bg-black/35 p-6 text-sm leading-6 text-zinc-400"}>
          {surface === "community"
            ? t("polls.communityEmpty")
            : t("polls.tournamentEmpty")}
        </div>
      ) : orderedPolls.length > 0 ? (
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
      ) : null}
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

function matchesViewer(
  snapshot: PollListSnapshot,
  userId: string | null,
  sessionId: string | null
) {
  return snapshot.viewerContext.userId === userId &&
    snapshot.viewerContext.sessionId === sessionId;
}

function createInitialPollState({
  initialSnapshot,
  initialPolls,
  initialError,
  surface,
  tournamentId,
  viewerUserId,
  viewerSessionId,
  authReady,
  allowLegacyInitial,
}: {
  initialSnapshot?: PollListSnapshot;
  initialPolls: PollViewerProjection[];
  initialError: string | null;
  surface: PollSurface;
  tournamentId: string | null;
  viewerUserId: string | null;
  viewerSessionId: string | null;
  authReady: boolean;
  allowLegacyInitial: boolean;
}) {
  if (!initialSnapshot) {
    return {
      polls: allowLegacyInitial ? initialPolls : [],
      snapshot: undefined,
      needsRecovery: Boolean(initialError) || !allowLegacyInitial,
    };
  }
  const sameSurface = initialSnapshot.surface === surface &&
    initialSnapshot.tournamentId === tournamentId;
  if (authReady && sameSurface && matchesViewer(initialSnapshot, viewerUserId, viewerSessionId)) {
    return {
      polls: projectPollListSnapshot(initialSnapshot),
      snapshot: initialSnapshot,
      needsRecovery: !isPollListSnapshotComplete(initialSnapshot),
    };
  }
  const snapshot: PollListSnapshot = {
    surface,
    tournamentId,
    public: surface === "community"
      ? { status: "not_applicable" }
      : sameSurface ? initialSnapshot.public : { status: "unavailable" },
    private: authReady && !viewerUserId
      ? { status: "not_applicable" }
      : { status: "unavailable" },
    accountState: authReady && !viewerUserId ? "anonymous" : "unavailable",
    viewerContext: { userId: viewerUserId, sessionId: viewerSessionId },
  };
  return {
    polls: projectPollListSnapshot(snapshot),
    snapshot,
    needsRecovery: true,
  };
}

function mergeAuthoritativeSelections(
  current: Record<string, string[]>,
  polls: PollViewerProjection[],
  dirtyPolls: Set<string>
) {
  const next: Record<string, string[]> = {};
  const remainingPollIds = new Set(polls.map((poll) => poll.id));
  for (const pollId of dirtyPolls) {
    if (!remainingPollIds.has(pollId)) dirtyPolls.delete(pollId);
  }
  for (const poll of polls) {
    if (!dirtyPolls.has(poll.id) || poll.status !== "open") {
      next[poll.id] = [...(poll.selectedOptionIds ?? [])];
      if (poll.status !== "open") dirtyPolls.delete(poll.id);
    } else {
      const validOptionIds = new Set(poll.options.map((option) => option.id));
      next[poll.id] = (current[poll.id] ?? []).filter((id) => validOptionIds.has(id)).slice(0, poll.maxSelections);
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
