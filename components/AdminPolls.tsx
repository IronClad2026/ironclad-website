"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  cancelPoll,
  deletePollDraft,
  loadAdminPollSnapshot,
  previewPollEligibility,
  publishPoll,
  publishPollFinalDecision,
  savePollDraft,
} from "@/app/admin/polls/actions";
import {
  derivePollStatus,
  POLL_LIMITS,
  type PollStatus,
  type PollViewerProjection,
} from "@/lib/polls";

export type AdminPollOption = {
  id: string;
  position: number;
  label: string;
  mapId: string | null;
  mapNameSnapshot: string | null;
  mapSlugSnapshot: string | null;
  voteCount?: number | null;
  selectionSharePercent?: number | null;
  total?: number | null;
  pollResultRank?: number | null;
  finalDecisionRank: number | null;
};

export type AdminPollView = {
  id: string;
  purpose: "tournament_decision" | "community_feedback";
  audienceKind:
    | "tournament_approved"
    | "tournament_division_approved"
    | "selected_tournament_players"
    | "active_players"
    | "selected_active_players";
  tournamentId: string | null;
  tournamentBracketId: string | null;
  question: string;
  context: string | null;
  optionSource: "text" | "coh3_map";
  maxSelections: number;
  winnerCount: number;
  authority: "advisory" | "binding";
  resultVisibility: "live" | "after_close";
  publicFinalTotals: boolean;
  draftAudienceInvalidated?: boolean;
  opensAt: string;
  closesAt: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  finalDecisionPublishedAt: string | null;
  finalDecisionBasis: string | null;
  finalRationale: string | null;
  bindingTieRuleUsed: boolean;
  status?: PollStatus;
  frozenEligibleCount: number;
  submittedBallotCount: number;
  selectedPlayerIds?: string[];
  computedWinnerOptionIds?: string[];
  cutoffTieOptionIds?: string[];
  cutoffSlotsRemaining?: number;
  options: AdminPollOption[];
};

export type AdminPollTournament = {
  id: string;
  title: string;
  status: string;
  brackets: {
    id: string;
    name: string;
    currentMapIds?: string[];
  }[];
  approvedPlayers: {
    id: string;
    displayName: string;
    inGameName: string;
    bracketId: string | null;
  }[];
};

export type AdminPollPlayer = {
  id: string;
  displayName: string;
  inGameName: string;
};

export type AdminPollMap = {
  id: string;
  slug: string;
  displayName: string;
};

type AdminPollsProps = {
  polls: AdminPollView[];
  tournaments: AdminPollTournament[];
  activePlayers: AdminPollPlayer[];
  activeMaps: AdminPollMap[];
  selectedPollId?: string;
  contextTournamentId?: string;
  defaultOpensAt?: string;
  defaultClosesAt?: string;
  notice?: string;
  detail?: string;
  eligibleCountResult?: number;
  configurationLoadFailed?: boolean;
};

type DraftOption = {
  key: string;
  label: string;
  mapId: string | null;
};

type DialogKind = "publish" | "cancel" | "final" | null;

const purposeLabels = {
  tournament_decision: "Tournament Decision",
  community_feedback: "Community Feedback",
} as const;

const audienceLabels = {
  tournament_approved: "All approved tournament players",
  tournament_division_approved: "Approved players in one Division",
  selected_tournament_players: "Selected approved tournament players",
  active_players: "Active IronClad players",
  selected_active_players: "Selected active IronClad players",
} as const;

const statusLabels: Record<PollStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
  final_decision_published: "Final decision published",
};

const ADMIN_POLL_REFRESH_MS = 7_000;
const ADMIN_POLL_MAX_TIMER_MS = 2_147_000_000;
const ADMIN_POLL_BOUNDARY_SETTLE_MS = 250;
const ADMIN_POLL_BOUNDARY_MIN_RETRY_MS = 1_000;

export default function AdminPolls({
  polls,
  tournaments,
  activePlayers,
  activeMaps,
  selectedPollId,
  contextTournamentId,
  defaultOpensAt = "",
  defaultClosesAt = "",
  notice,
  detail,
  eligibleCountResult,
  configurationLoadFailed = false,
}: AdminPollsProps) {
  const [selectedPoll, setSelectedPoll] = useState<AdminPollView | null>(
    () => polls.find((poll) => poll.id === selectedPollId) ?? null
  );
  useAdminPollRefresh(selectedPoll, setSelectedPoll);
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredPolls = polls.filter((poll) => {
    const status = pollStatus(poll);
    return (
      (purposeFilter === "all" || poll.purpose === purposeFilter) &&
      (statusFilter === "all" || status === statusFilter)
    );
  });

  return (
    <main className="min-h-screen min-w-0 bg-black px-4 pb-20 pt-28 text-white sm:px-6 sm:pt-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-orange-500/20 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
              IronClad Admin
            </p>
            <h1 className="mt-2 break-words text-3xl font-black sm:text-4xl">
              Polls &amp; Decisions
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Publish frozen-audience Tournament Decisions and Advisory Community
              Feedback without changing tournament systems automatically.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-zinc-300 transition hover:border-orange-400/50 hover:text-white"
          >
            Back to Admin
          </Link>
        </header>

        {notice || configurationLoadFailed ? (
          <AdminPollNotice
            notice={notice ?? "load-failed"}
            detail={detail}
            eligibleCount={eligibleCountResult}
          />
        ) : null}

        <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
            <Link
              href={
                contextTournamentId
                  ? `/admin/polls?tournament=${encodeURIComponent(contextTournamentId)}`
                  : "/admin/polls"
              }
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black uppercase tracking-wider transition hover:bg-orange-400"
            >
              <Plus size={17} aria-hidden="true" /> New Poll
            </Link>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <FilterSelect
                label="Filter by purpose"
                value={purposeFilter}
                onChange={setPurposeFilter}
                options={[
                  ["all", "All purposes"],
                  ["tournament_decision", "Tournament Decisions"],
                  ["community_feedback", "Community Feedback"],
                ]}
              />
              <FilterSelect
                label="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  ["all", "All statuses"],
                  ["draft", "Draft"],
                  ["scheduled", "Scheduled"],
                  ["open", "Open"],
                  ["closed", "Closed"],
                  ["cancelled", "Cancelled"],
                  ["final_decision_published", "Final decision published"],
                ]}
              />
            </div>

            <div className="mt-5 grid gap-3">
              {filteredPolls.map((poll) => (
                <PollListItem
                  key={poll.id}
                  poll={poll}
                  selected={poll.id === selectedPoll?.id}
                  contextTournamentId={contextTournamentId}
                />
              ))}
              {filteredPolls.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">
                  No polls match these filters.
                </p>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 md:p-8">
            {selectedPoll?.publishedAt ? (
              <PublishedPollView poll={selectedPoll} />
            ) : (
              <DraftPollEditor
                poll={selectedPoll}
                tournaments={tournaments}
                activePlayers={activePlayers}
                activeMaps={activeMaps}
                contextTournamentId={contextTournamentId}
                defaultOpensAt={defaultOpensAt}
                defaultClosesAt={defaultClosesAt}
                revalidatedEligibleCount={eligibleCountResult}
                configurationLoadFailed={configurationLoadFailed}
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function useAdminPollRefresh(
  poll: AdminPollView | null,
  setPoll: React.Dispatch<React.SetStateAction<AdminPollView | null>>
) {
  const status = poll ? pollStatus(poll) : null;

  useEffect(() => {
    if (!poll || !poll.publishedAt || !status) {
      return;
    }
    const initialDelay = adminPollRefreshDelay(poll, status);
    if (initialDelay === null) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let failureCount = 0;
    let requestSequence = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const canRefresh = () =>
      document.visibilityState === "visible" && navigator.onLine;
    const schedule = (delay: number) => {
      clearTimer();
      if (!cancelled && canRefresh()) {
        timer = setTimeout(() => {
          if (delay > ADMIN_POLL_MAX_TIMER_MS) {
            const nextDelay = adminPollRefreshDelay(poll, status);
            if (nextDelay !== null) schedule(nextDelay);
            return;
          }
          void refresh();
        }, Math.min(delay, ADMIN_POLL_MAX_TIMER_MS));
      }
    };
    const refresh = async () => {
      if (cancelled || inFlight || !canRefresh()) return;
      inFlight = true;
      const sequence = ++requestSequence;
      try {
        const result = await loadAdminPollSnapshot(poll.id);
        if (cancelled || sequence !== requestSequence) return;
        if (result.ok) {
          failureCount = 0;
          setPoll(mapAdminPollProjection(result.poll));
        } else {
          failureCount += 1;
          schedule(
            Math.min(
              ADMIN_POLL_REFRESH_MS * 2 ** failureCount,
              ADMIN_POLL_REFRESH_MS * 4
            )
          );
        }
      } catch {
        if (!cancelled) {
          failureCount += 1;
          schedule(
            Math.min(
              ADMIN_POLL_REFRESH_MS * 2 ** failureCount,
              ADMIN_POLL_REFRESH_MS * 4
            )
          );
        }
      } finally {
        inFlight = false;
      }
    };
    const resume = () => {
      clearTimer();
      if (canRefresh()) void refresh();
    };
    const pause = () => clearTimer();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") resume();
      else pause();
    };

    schedule(initialDelay);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", pause);

    return () => {
      cancelled = true;
      requestSequence += 1;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", pause);
    };
  }, [poll, setPoll, status]);
}

function adminPollRefreshDelay(
  poll: AdminPollView,
  status: PollStatus
): number | null {
  if (status === "open" && poll.resultVisibility === "live") {
    return ADMIN_POLL_REFRESH_MS;
  }
  if (status === "scheduled") {
    return boundaryRefreshDelay(poll.opensAt);
  }
  if (status === "open" && poll.resultVisibility === "after_close") {
    return boundaryRefreshDelay(poll.closesAt);
  }
  return null;
}

function boundaryRefreshDelay(boundary: string) {
  const remaining = Date.parse(boundary) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return ADMIN_POLL_BOUNDARY_MIN_RETRY_MS;
  }
  return remaining + ADMIN_POLL_BOUNDARY_SETTLE_MS;
}

function mapAdminPollProjection(poll: PollViewerProjection): AdminPollView {
  return {
    id: poll.id,
    purpose: poll.purpose,
    audienceKind: poll.audienceKind,
    tournamentId: poll.tournamentId,
    tournamentBracketId: poll.tournamentBracketId,
    question: poll.question,
    context: poll.context,
    optionSource: poll.optionSource,
    maxSelections: poll.maxSelections,
    winnerCount: poll.winnerCount,
    authority: poll.authority,
    resultVisibility: poll.resultVisibility,
    publicFinalTotals: poll.publicFinalTotals,
    draftAudienceInvalidated: poll.draftAudienceInvalidated ?? false,
    opensAt: poll.opensAt,
    closesAt: poll.closesAt,
    publishedAt: poll.publishedAt,
    cancelledAt: poll.cancelledAt,
    cancellationReason: poll.cancellationReason,
    finalDecisionPublishedAt: poll.finalDecisionPublishedAt,
    finalDecisionBasis: poll.finalDecisionBasis,
    finalRationale: poll.finalRationale,
    bindingTieRuleUsed: poll.bindingTieRuleUsed,
    status: poll.status,
    frozenEligibleCount: poll.eligibleCount ?? 0,
    submittedBallotCount: poll.submittedBallotCount ?? 0,
    selectedPlayerIds: poll.selectedPlayerIds ?? [],
    computedWinnerOptionIds: poll.computedWinnerOptionIds ?? [],
    cutoffTieOptionIds: poll.cutoffTieOptionIds ?? [],
    cutoffSlotsRemaining: poll.cutoffSlotsRemaining ?? 0,
    options: poll.options.map((option) => ({
      id: option.id,
      position: option.position,
      label: option.label,
      mapId: option.map?.id ?? null,
      mapNameSnapshot: option.map?.name ?? null,
      mapSlugSnapshot: option.map?.slug ?? null,
      voteCount: option.voteCount,
      selectionSharePercent: option.selectionSharePercent,
      pollResultRank: option.pollResultRank,
      finalDecisionRank: option.finalDecisionRank,
    })),
  };
}

function DraftPollEditor({
  poll,
  tournaments,
  activePlayers,
  activeMaps,
  contextTournamentId,
  defaultOpensAt,
  defaultClosesAt,
  revalidatedEligibleCount,
  configurationLoadFailed,
}: {
  poll: AdminPollView | null;
  tournaments: AdminPollTournament[];
  activePlayers: AdminPollPlayer[];
  activeMaps: AdminPollMap[];
  contextTournamentId?: string;
  defaultOpensAt: string;
  defaultClosesAt: string;
  revalidatedEligibleCount?: number;
  configurationLoadFailed: boolean;
}) {
  const initialTournament =
    poll?.tournamentId ??
    tournaments.find(
      (tournament) =>
        tournament.id === contextTournamentId &&
        !["completed", "cancelled", "voided"].includes(tournament.status)
    )?.id ??
    tournaments.find((tournament) =>
      !["completed", "cancelled", "voided"].includes(tournament.status)
    )?.id ??
    "";
  const [purpose, setPurpose] = useState<AdminPollView["purpose"]>(
    poll?.purpose ?? (initialTournament ? "tournament_decision" : "community_feedback")
  );
  const [audienceKind, setAudienceKind] = useState<AdminPollView["audienceKind"]>(
    poll?.audienceKind ??
      (initialTournament ? "tournament_approved" : "active_players")
  );
  const [tournamentId, setTournamentId] = useState(initialTournament);
  const [bracketId, setBracketId] = useState(poll?.tournamentBracketId ?? "");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(
    poll?.selectedPlayerIds ?? []
  );
  const [optionSource, setOptionSource] = useState<"text" | "coh3_map">(
    poll?.optionSource ?? "text"
  );
  const [options, setOptions] = useState<DraftOption[]>(() =>
    poll
      ? poll.options.map((option) => ({
          key: option.id,
          label: option.label,
          mapId: option.mapId,
        }))
      : [newTextOption(1), newTextOption(2)]
  );
  const [maxSelections, setMaxSelections] = useState(poll?.maxSelections ?? 1);
  const [winnerCount, setWinnerCount] = useState(poll?.winnerCount ?? 1);
  const [authority, setAuthority] = useState<"advisory" | "binding">(
    poll?.authority ?? "advisory"
  );
  const [dialog, setDialog] = useState<DialogKind>(null);
  const selectedTournament = tournaments.find(
    (tournament) => tournament.id === tournamentId
  );
  const tournamentPublicationBlocked =
    purpose === "tournament_decision" &&
    Boolean(
      selectedTournament &&
        ["completed", "cancelled", "voided"].includes(
          selectedTournament.status
        )
    );
  const selectedBracket = selectedTournament?.brackets.find(
    (bracket) => bracket.id === bracketId
  );
  const candidatePlayers =
    purpose === "community_feedback"
      ? activePlayers
      : selectedTournament?.approvedPlayers ?? [];
  const scopedCandidatePlayers =
    audienceKind === "tournament_division_approved" && bracketId
      ? (selectedTournament?.approvedPlayers ?? []).filter(
          (player) => player.bracketId === bracketId
        )
      : candidatePlayers;
  const estimatedEligibility =
    audienceKind === "selected_tournament_players" ||
    audienceKind === "selected_active_players"
      ? selectedPlayerIds.filter((id) =>
          candidatePlayers.some((player) => player.id === id)
        ).length
      : scopedCandidatePlayers.length;
  const previewEligibility =
    revalidatedEligibleCount ?? estimatedEligibility;
  const savedTournament = poll
    ? tournaments.find((tournament) => tournament.id === poll.tournamentId)
    : undefined;
  const savedCandidatePlayers =
    poll?.purpose === "community_feedback"
      ? activePlayers
      : savedTournament?.approvedPlayers ?? [];
  const savedEligibilityEstimate = !poll
    ? estimatedEligibility
    : poll.audienceKind === "selected_tournament_players" ||
        poll.audienceKind === "selected_active_players"
      ? (poll.selectedPlayerIds ?? []).filter((id) =>
          savedCandidatePlayers.some((player) => player.id === id)
        ).length
      : poll.audienceKind === "tournament_division_approved"
        ? (savedTournament?.approvedPlayers ?? []).filter(
            (player) => player.bracketId === poll.tournamentBracketId
          ).length
        : savedCandidatePlayers.length;
  const currentPoolIds = new Set(
    selectedBracket
      ? selectedBracket.currentMapIds ?? []
      : (selectedTournament?.brackets ?? []).flatMap(
          (bracket) => bracket.currentMapIds ?? []
        )
  );
  const selectedMapIds = options
    .map((option) => option.mapId)
    .filter((mapId): mapId is string => Boolean(mapId));

  function updatePurpose(next: AdminPollView["purpose"]) {
    setPurpose(next);
    setSelectedPlayerIds([]);
    if (next === "community_feedback") {
      setAudienceKind("active_players");
      setAuthority("advisory");
      setTournamentId("");
      setBracketId("");
    } else {
      setAudienceKind("tournament_approved");
      setTournamentId(initialTournament);
    }
  }

  function setOptionMode(next: "text" | "coh3_map") {
    setOptionSource(next);
    setOptions(
      next === "text" ? [newTextOption(1), newTextOption(2)] : []
    );
  }

  function addTextOption() {
    if (options.length < POLL_LIMITS.maximumOptions) {
      setOptions((current) => [...current, newTextOption(current.length + 1)]);
    }
  }

  function toggleMap(map: AdminPollMap) {
    setOptions((current) => {
      const existing = current.find((option) => option.mapId === map.id);
      if (existing) {
        return current.filter((option) => option.mapId !== map.id);
      }
      if (current.length >= POLL_LIMITS.maximumOptions) {
        return current;
      }
      return [
        ...current,
        { key: `map-${map.id}`, label: map.displayName, mapId: map.id },
      ];
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
            {poll ? "Editable Draft" : "New Poll"}
          </p>
          <h2 className="mt-2 break-words text-2xl font-black">
            {poll?.question || "Configure Poll"}
          </h2>
        </div>
        <StatusBadge status="draft" />
      </div>

      <form action={savePollDraft} className="mt-7 grid min-w-0 gap-6">
        {poll ? <input type="hidden" name="pollId" value={poll.id} /> : null}
        {configurationLoadFailed ? (
          <p
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-100"
          >
            Required tournament, player, or map configuration could not be
            loaded. Draft mutation and publication are disabled until a clean
            reload succeeds.
          </p>
        ) : null}

        <fieldset className="grid gap-4 rounded-2xl border border-white/10 p-4 sm:p-5">
          <legend className="px-2 text-sm font-black uppercase tracking-wider text-orange-200">
            Purpose &amp; audience
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Purpose"
              name="purpose"
              value={purpose}
              onChange={(event) =>
                updatePurpose(event.target.value as AdminPollView["purpose"])
              }
              options={[
                ["tournament_decision", "Tournament Decision"],
                ["community_feedback", "Community Feedback"],
              ]}
            />
            <SelectField
              label="Audience"
              name="audienceKind"
              value={audienceKind}
              onChange={(event) => {
                setAudienceKind(
                  event.target.value as AdminPollView["audienceKind"]
                );
                setSelectedPlayerIds([]);
              }}
              options={
                purpose === "tournament_decision"
                  ? [
                      ["tournament_approved", audienceLabels.tournament_approved],
                      [
                        "tournament_division_approved",
                        audienceLabels.tournament_division_approved,
                      ],
                      [
                        "selected_tournament_players",
                        audienceLabels.selected_tournament_players,
                      ],
                    ]
                  : [
                      ["active_players", audienceLabels.active_players],
                      [
                        "selected_active_players",
                        audienceLabels.selected_active_players,
                      ],
                    ]
              }
            />
          </div>

          {purpose === "tournament_decision" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Tournament"
                name="tournamentId"
                value={tournamentId}
                onChange={(event) => {
                  setTournamentId(event.target.value);
                  setBracketId("");
                  setSelectedPlayerIds([]);
                }}
                required
                options={[
                  ["", "Select tournament"],
                  ...tournaments
                    .filter(
                      (tournament) =>
                        !["completed", "cancelled", "voided"].includes(
                          tournament.status
                        ) || tournament.id === poll?.tournamentId
                    )
                    .map(
                      (tournament) =>
                        [tournament.id, tournament.title] as [string, string]
                    ),
                ]}
              />
              {audienceKind === "tournament_division_approved" ? (
                <SelectField
                  label="Division"
                  name="tournamentBracketId"
                  value={bracketId}
                  onChange={(event) => setBracketId(event.target.value)}
                  required
                  options={[
                    ["", "Select Division"],
                    ...(selectedTournament?.brackets ?? []).map(
                      (bracket) =>
                        [bracket.id, bracket.name] as [string, string]
                    ),
                  ]}
                />
              ) : null}
            </div>
          ) : null}

          {audienceKind === "selected_tournament_players" ||
          audienceKind === "selected_active_players" ? (
            <PlayerSelector
              players={candidatePlayers}
              selectedIds={selectedPlayerIds}
              onChange={setSelectedPlayerIds}
            />
          ) : null}

          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-orange-300">
              Eligibility preview
            </p>
            <p className="mt-1 text-2xl font-black">{previewEligibility}</p>
            <p className="mt-1 text-sm text-zinc-400">
              Estimated from current data. Saving and previewing the Draft
              revalidates this audience; publication freezes the authoritative
              count atomically.
            </p>
          </div>
          {poll?.draftAudienceInvalidated ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-100"
            >
              A selected player closed their account after this Draft was
              saved. Re-review the selected audience and save the Draft again
              before publication.
            </p>
          ) : null}
          {tournamentPublicationBlocked ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-100"
            >
              New Tournament Decisions cannot be published for a completed,
              cancelled, or voided tournament. This Draft may be deleted or
              reassigned to an eligible tournament.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-white/10 p-4 sm:p-5">
          <legend className="px-2 text-sm font-black uppercase tracking-wider text-orange-200">
            Question &amp; options
          </legend>
          <TextField
            label="Question"
            name="question"
            defaultValue={poll?.question ?? ""}
            required
            maxLength={POLL_LIMITS.question}
          />
          <label>
            <span className="text-sm font-bold">Context or description</span>
            <textarea
              name="context"
              defaultValue={poll?.context ?? ""}
              maxLength={POLL_LIMITS.context}
              rows={4}
              className={textareaClass}
            />
          </label>
          <SelectField
            label="Option source"
            name="optionSource"
            value={optionSource}
            onChange={(event) =>
              setOptionMode(event.target.value as "text" | "coh3_map")
            }
            options={[
              ["text", "Text options"],
              ["coh3_map", "CoH3 map catalogue"],
            ]}
          />

          {optionSource === "text" ? (
            <fieldset
              aria-label="Answer options"
              className="grid gap-3 rounded-xl border border-white/10 p-3"
            >
              {options.map((option, index) => (
                <OptionEditorRow
                  key={option.key}
                  index={index}
                  length={options.length}
                  label={option.label}
                  onLabelChange={(label) =>
                    setOptions((current) =>
                      current.map((candidate) =>
                        candidate.key === option.key
                          ? { ...candidate, label }
                          : candidate
                      )
                    )
                  }
                  onMove={(direction) =>
                    setOptions((current) =>
                      moveItem(current, index, index + direction)
                    )
                  }
                  onRemove={() =>
                    setOptions((current) =>
                      current.filter((candidate) => candidate.key !== option.key)
                    )
                  }
                />
              ))}
              <button
                type="button"
                onClick={addTextOption}
                disabled={options.length >= POLL_LIMITS.maximumOptions}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-orange-400/30 px-4 text-sm font-black text-orange-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} aria-hidden="true" /> Add option
              </button>
            </fieldset>
          ) : (
            <MapOptionPicker
              maps={activeMaps}
              options={options}
              selectedMapIds={selectedMapIds}
              currentPoolIds={currentPoolIds}
              onToggle={toggleMap}
              onMove={(index, direction) =>
                setOptions((current) =>
                  moveItem(current, index, index + direction)
                )
              }
              onRemove={(index) =>
                setOptions((current) =>
                  current.filter((_, optionIndex) => optionIndex !== index)
                )
              }
            />
          )}
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-white/10 p-4 sm:p-5">
          <legend className="px-2 text-sm font-black uppercase tracking-wider text-orange-200">
            Rules &amp; timing
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField
              label="Maximum selections"
              name="maxSelections"
              value={maxSelections}
              min={1}
              max={POLL_LIMITS.maximumSelections}
              onChange={(value) => {
                setMaxSelections(value);
                setWinnerCount((current) => Math.min(current, value));
              }}
            />
            <NumberField
              label="Winner count"
              name="winnerCount"
              value={winnerCount}
              min={1}
              max={POLL_LIMITS.maximumWinners}
              onChange={setWinnerCount}
            />
            {purpose === "community_feedback" ? (
              <>
                <input type="hidden" name="authority" value="advisory" />
                <ReadOnlyValue label="Authority" value="Advisory (required)" />
              </>
            ) : (
              <SelectField
                label="Authority"
                name="authority"
                value={authority}
                onChange={(event) =>
                  setAuthority(event.target.value as "advisory" | "binding")
                }
                options={[
                  ["advisory", "Advisory"],
                  ["binding", "Binding"],
                ]}
              />
            )}
            <SelectField
              label="Result visibility"
              name="resultVisibility"
              defaultValue={poll?.resultVisibility ?? "after_close"}
              options={[
                ["after_close", "Hidden until close"],
                ["live", "Live results"],
              ]}
            />
            <TextField
              label="Opening time (UTC)"
              name="opensAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(poll?.opensAt ?? defaultOpensAt)}
              required
            />
            <TextField
              label="Closing time (UTC)"
              name="closesAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(poll?.closesAt ?? defaultClosesAt)}
              required
            />
          </div>
          {purpose === "tournament_decision" ? (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3">
              <input
                type="checkbox"
                name="publicFinalTotals"
                value="true"
                defaultChecked={poll?.publicFinalTotals ?? false}
                className="mt-1 h-5 w-5 accent-orange-500"
              />
              <span>
                <span className="block text-sm font-black">
                  Show final aggregate totals publicly
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-400">
                  Off by default. Only the final outcome is public otherwise.
                </span>
              </span>
            </label>
          ) : (
            <input type="hidden" name="publicFinalTotals" value="false" />
          )}
          {authority === "binding" && purpose === "tournament_decision" ? (
            <BindingWarning />
          ) : null}
        </fieldset>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          {poll ? (
            <button
              type="submit"
              formAction={deletePollDraft}
              formNoValidate
              className="min-h-11 rounded-xl border border-red-500/30 px-5 text-sm font-black text-red-200 transition hover:bg-red-500/10"
            >
              Delete Draft
            </button>
          ) : null}
          <button
            disabled={configurationLoadFailed}
            className="min-h-11 rounded-xl border border-orange-400/40 px-5 text-sm font-black text-orange-100 transition hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Draft
          </button>
          {poll ? (
            <button
              type="button"
              onClick={() => setDialog("publish")}
              disabled={
                poll.draftAudienceInvalidated === true ||
                tournamentPublicationBlocked ||
                configurationLoadFailed
              }
              className="min-h-11 rounded-xl bg-orange-500 px-5 text-sm font-black text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {poll.draftAudienceInvalidated
                ? "Save Audience Before Publication"
                : tournamentPublicationBlocked
                  ? "Tournament Cannot Accept New Polls"
                  : configurationLoadFailed
                    ? "Configuration Unavailable"
                : "Review publication"}
            </button>
          ) : null}
        </div>
      </form>

      {poll ? (
        <form action={previewPollEligibility} className="mt-3 flex justify-end">
          <input type="hidden" name="pollId" value={poll.id} />
          <button
            disabled={configurationLoadFailed}
            className="min-h-11 rounded-xl px-4 text-sm font-black text-zinc-300 underline decoration-orange-500/50 underline-offset-4 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Revalidate eligibility preview
          </button>
        </form>
      ) : null}

      {dialog === "publish" && poll ? (
        <PublishDialog
          poll={poll}
          eligibilityPreviewCount={
            revalidatedEligibleCount ?? savedEligibilityEstimate
          }
          tournamentTitle={savedTournament?.title ?? null}
          divisionName={
            savedTournament?.brackets.find(
              (bracket) => bracket.id === poll.tournamentBracketId
            )?.name ?? null
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function PublishedPollView({ poll }: { poll: AdminPollView }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const status = pollStatus(poll);
  const canCancel =
    status !== "cancelled" && status !== "final_decision_published";
  const canFinalize =
    poll.purpose === "tournament_decision" && status === "closed";
  const voteCountsVisible = poll.options.some(
    (option) => optionVoteCount(option) !== null
  );
  const finalOptions = [...poll.options]
    .filter((option) => option.finalDecisionRank !== null)
    .sort(
      (left, right) =>
        (left.finalDecisionRank ?? 99) - (right.finalDecisionRank ?? 99)
    );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge>{purposeLabels[poll.purpose]}</Badge>
            <Badge>{poll.authority}</Badge>
          </div>
          <h2 className="mt-3 break-words text-2xl font-black sm:text-3xl">
            {poll.question}
          </h2>
          {poll.context ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">
              {poll.context}
            </p>
          ) : null}
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Frozen eligible players" value={poll.frozenEligibleCount} />
        <Metric label="Submitted ballots" value={poll.submittedBallotCount} />
        <Metric
          label="Choice / winners"
          value={`${poll.maxSelections} / ${poll.winnerCount}`}
        />
        <Metric label="Opens" value={formatDateTime(poll.opensAt)} />
        <Metric label="Closes" value={formatDateTime(poll.closesAt)} />
        <Metric
          label="Results"
          value={poll.resultVisibility === "live" ? "Live" : "Hidden until close"}
        />
      </dl>

      <section className="mt-7">
        <h3 className="text-sm font-black uppercase tracking-wider text-orange-200">
          {voteCountsVisible &&
          (status === "closed" || status === "final_decision_published")
            ? "Poll result"
            : "Published options"}
        </h3>
        <div className="mt-3 grid gap-3">
          {poll.options.map((option) => {
            const count = optionVoteCount(option);
            return (
              <article
                key={option.id}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-black">
                    {option.position}. {option.label}
                  </p>
                  {option.mapSlugSnapshot ? (
                    <p className="mt-1 break-all text-xs text-zinc-500">
                      Historical map: {option.mapSlugSnapshot}
                    </p>
                  ) : null}
                </div>
                {count !== null ? (
                  <span className="shrink-0 text-right text-sm font-black text-orange-300">
                    <span className="block">
                      {count} {count === 1 ? "ballot" : "ballots"}
                    </span>
                    {option.pollResultRank !== null &&
                    option.pollResultRank !== undefined ? (
                      <span className="mt-1 block text-[10px] uppercase tracking-wider text-zinc-500">
                        Poll result rank #{option.pollResultRank}
                      </span>
                    ) : null}
                    {poll.maxSelections > 1 &&
                    option.selectionSharePercent !== null &&
                    option.selectionSharePercent !== undefined ? (
                      <span className="mt-1 block max-w-52 text-[10px] font-medium leading-4 text-zinc-500">
                        {option.selectionSharePercent}% — share of submitted
                        ballots selecting this option
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
        {!voteCountsVisible && status === "open" ? (
          <p className="mt-3 rounded-xl border border-white/10 p-4 text-sm text-zinc-400">
            Per-option totals are hidden from Admin while this poll is open.
            Operational turnout remains visible above.
          </p>
        ) : null}
      </section>

      {finalOptions.length > 0 ? (
        <section className="mt-7 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
          <h3 className="font-black text-emerald-200">
            {poll.authority === "advisory"
              ? "Admin final decision"
              : "Authoritative final decision"}
          </h3>
          <ol className="mt-3 grid gap-2">
            {finalOptions.map((option) => (
              <li key={option.id} className="font-bold">
                {option.finalDecisionRank}. {option.label}
              </li>
            ))}
          </ol>
          {poll.bindingTieRuleUsed ? (
            <p className="mt-3 text-sm text-zinc-300">
              The published cutoff tie-break rule was used.
            </p>
          ) : null}
          {poll.finalRationale ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-300">
              {poll.finalRationale}
            </p>
          ) : null}
        </section>
      ) : null}

      {poll.cancelledAt ? (
        <section className="mt-7 rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
          <h3 className="font-black text-red-200">Cancelled</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">
            {poll.cancellationReason}
          </p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {canCancel ? (
          <button
            type="button"
            onClick={() => setDialog("cancel")}
            className="min-h-11 rounded-xl border border-red-500/30 px-5 text-sm font-black text-red-200 transition hover:bg-red-500/10"
          >
            Cancel Poll
          </button>
        ) : null}
        {canFinalize ? (
          <button
            type="button"
            onClick={() => setDialog("final")}
            disabled={poll.authority === "binding" && poll.submittedBallotCount === 0}
            className="min-h-11 rounded-xl bg-orange-500 px-5 text-sm font-black text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Publish Final Decision
          </button>
        ) : null}
      </div>
      {canFinalize && poll.authority === "binding" && poll.submittedBallotCount === 0 ? (
        <p className="mt-3 text-right text-sm font-bold text-red-300">
          A zero-ballot Binding poll is invalid. Cancel it with a reason and
          create a replacement.
        </p>
      ) : null}

      {dialog === "cancel" ? (
        <CancelDialog poll={poll} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "final" ? (
        <FinalDecisionDialog poll={poll} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

function PublishDialog({
  poll,
  eligibilityPreviewCount,
  tournamentTitle,
  divisionName,
  onClose,
}: {
  poll: AdminPollView;
  eligibilityPreviewCount: number;
  tournamentTitle: string | null;
  divisionName: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog title="Publish poll" onClose={onClose}>
      <p className="text-sm leading-6 text-zinc-300">
        Current/revalidated eligibility preview:{" "}
        <strong>{eligibilityPreviewCount} players</strong>. Publication
        revalidates and freezes the audience atomically; the final authoritative
        frozen count is returned after successful publication.
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <Metric label="Purpose" value={purposeLabels[poll.purpose]} />
        <Metric label="Audience" value={audienceLabels[poll.audienceKind]} />
        {poll.purpose === "tournament_decision" ? (
          <Metric
            label="Tournament"
            value={tournamentTitle ?? "Tournament unavailable"}
          />
        ) : null}
        {poll.tournamentBracketId ? (
          <Metric
            label="Division"
            value={divisionName ?? "Division unavailable"}
          />
        ) : null}
        <Metric label="Authority" value={capitalize(poll.authority)} />
        <Metric
          label="Maximum selections / winners"
          value={`${poll.maxSelections} / ${poll.winnerCount}`}
        />
        <Metric label="Opens" value={formatDateTime(poll.opensAt)} />
        <Metric label="Closes" value={formatDateTime(poll.closesAt)} />
        <Metric
          label="Visibility"
          value={poll.resultVisibility === "live" ? "Live" : "Hidden until close"}
        />
        <Metric
          label="Public totals"
          value={poll.publicFinalTotals ? "Enabled" : "Outcome only"}
        />
      </dl>
      <div className="mt-5 rounded-xl border border-white/10 p-4">
        <p className="text-xs font-black uppercase tracking-wider text-zinc-400">
          Frozen option order
        </p>
        <ol className="mt-2 grid gap-1 text-sm font-bold">
          {poll.options.map((option) => (
            <li key={option.id} className="break-words">
              {option.position}. {option.label}
            </li>
          ))}
        </ol>
      </div>
      {poll.authority === "binding" ? <BindingWarning /> : null}
      <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm font-bold text-red-100">
        After publication this poll cannot be edited, reopened, or rescheduled.
        Invalid polls must be cancelled with a reason and replaced.
      </p>
      <form action={publishPoll} className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <input type="hidden" name="pollId" value={poll.id} />
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-white/15 px-5 font-black text-zinc-300"
        >
          Keep Draft
        </button>
        <button className="min-h-11 rounded-xl bg-orange-500 px-5 font-black hover:bg-orange-400">
          Freeze Audience &amp; Publish
        </button>
      </form>
    </Dialog>
  );
}

function CancelDialog({ poll, onClose }: { poll: AdminPollView; onClose: () => void }) {
  return (
    <Dialog title="Cancel poll" onClose={onClose}>
      <p className="text-sm leading-6 text-zinc-300">
        Cancellation preserves the published configuration, frozen eligibility,
        and any submitted aggregate result. It cannot be undone through ordinary
        Admin controls.
      </p>
      <form action={cancelPoll} className="mt-5">
        <input type="hidden" name="pollId" value={poll.id} />
        <label>
          <span className="text-sm font-black">Cancellation reason</span>
          <textarea
            name="reason"
            required
            maxLength={POLL_LIMITS.cancellationReason}
            rows={4}
            className={textareaClass}
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Keep Poll
          </button>
          <button className="min-h-11 rounded-xl bg-red-600 px-5 font-black hover:bg-red-500">
            Cancel Poll
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FinalDecisionDialog({ poll, onClose }: { poll: AdminPollView; onClose: () => void }) {
  const computedIds = poll.computedWinnerOptionIds ?? computeTopOptionIds(poll);
  const tieIds = poll.cutoffTieOptionIds ?? [];
  const fixedIds = computedIds.filter((id) => !tieIds.includes(id));
  const tieSlots =
    poll.cutoffSlotsRemaining ?? Math.max(0, poll.winnerCount - fixedIds.length);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    poll.authority === "binding" ? [] : computedIds
  );
  const advisoryOverride =
    poll.authority === "advisory" && !sameSet(selectedIds, computedIds);

  return (
    <Dialog title="Publish final decision" onClose={onClose}>
      {poll.authority === "binding" ? (
        <p className="text-sm leading-6 text-zinc-300">
          {tieIds.length > 0 ? (
            <>
              The authoritative options safely above the cutoff are fixed.
              Admin input is limited to filling {tieSlots} remaining{" "}
              {tieSlots === 1 ? "place" : "places"} from the exact cutoff-tie
              group.
            </>
          ) : (
            <>
              The database has computed every authoritative winner. There is no
              cutoff tie and no Admin option selection is permitted.
            </>
          )}
        </p>
      ) : (
        <p className="text-sm leading-6 text-zinc-300">
          Select exactly {poll.winnerCount} final {poll.winnerCount === 1 ? "option" : "options"}.
          The aggregate Poll result remains preserved and is shown separately.
        </p>
      )}
      <form action={publishPollFinalDecision} className="mt-5">
        <input type="hidden" name="pollId" value={poll.id} />
        <fieldset className="grid gap-2">
          <legend className="sr-only">Final decision options</legend>
          {poll.options.map((option) => {
            const fixed = poll.authority === "binding" && fixedIds.includes(option.id);
            const eligibleTie = poll.authority === "binding" && tieIds.includes(option.id);
            const disabled = poll.authority === "binding" && !eligibleTie;
            const checked = fixed || selectedIds.includes(option.id);
            return (
              <label
                key={option.id}
                className={`flex min-h-11 items-center gap-3 rounded-xl border p-3 ${
                  checked ? "border-orange-400/50 bg-orange-500/10" : "border-white/10"
                } ${disabled && !fixed ? "opacity-45" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  name={fixed ? undefined : "optionIds"}
                  value={option.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    if (fixed) return;
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id)
                    );
                  }}
                  className="h-5 w-5 accent-orange-500"
                />
                <span className="min-w-0 flex-1 break-words font-bold">
                  {option.label}
                </span>
                {optionVoteCount(option) !== null ? (
                  <span className="shrink-0 text-sm text-zinc-400">
                    {optionVoteCount(option)} votes
                  </span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        <label className="mt-5 block">
          <span className="text-sm font-black">
            Final rationale {advisoryOverride ? "(required for an override)" : "(optional)"}
          </span>
          <textarea
            name="rationale"
            required={advisoryOverride}
            maxLength={POLL_LIMITS.finalRationale}
            rows={4}
            className={textareaClass}
          />
        </label>
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm font-bold text-red-100">
          Final decision publication is one-way. Binding winners cannot be
          replaced through ordinary Admin UI.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Review Later
          </button>
          <button
            disabled={
              selectedIds.length !==
              (poll.authority === "binding" ? tieSlots : poll.winnerCount)
            }
            className="min-h-11 rounded-xl bg-orange-500 px-5 font-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Publish Final Decision
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href]'
        ) ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border border-orange-500/30 bg-zinc-950 p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6"
      >
        <header className="sticky top-0 z-10 -mx-1 mb-5 flex items-start justify-between gap-4 bg-zinc-950 px-1 pb-3">
          <h2 className="break-words text-2xl font-black">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-zinc-300 hover:text-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PlayerSelector({
  players,
  selectedIds,
  onChange,
}: {
  players: AdminPollPlayer[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = players.filter((player) =>
    `${player.displayName} ${player.inGameName}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const unavailableIds = selectedIds.filter(
    (id) => !players.some((player) => player.id === id)
  );
  return (
    <fieldset className="rounded-xl border border-white/10 p-3">
      <legend className="px-2 text-sm font-black">Selected players</legend>
      {selectedIds.map((playerId) => (
        <input
          key={playerId}
          type="hidden"
          name="selectedPlayerIds"
          value={playerId}
        />
      ))}
      <label>
        <span className="sr-only">Search eligible players</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search eligible players"
          className={inputClass}
        />
      </label>
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {unavailableIds.map((playerId, index) => (
          <div
            key={playerId}
            className="flex min-h-11 items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/5 p-3"
          >
            <span className="min-w-0 flex-1 text-sm font-bold text-red-100">
              Unavailable selected player {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(selectedIds.filter((id) => id !== playerId))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-500/30 text-red-200"
              aria-label={`Remove unavailable selected player ${index + 1}`}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
        {filtered.map((player) => (
          <label
            key={player.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(player.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selectedIds, player.id]
                    : selectedIds.filter((id) => id !== player.id)
                )
              }
              className="h-5 w-5 accent-orange-500"
            />
            <span className="min-w-0">
              <span className="block break-words text-sm font-black">
                {player.inGameName}
              </span>
              {player.displayName !== player.inGameName ? (
                <span className="block break-words text-xs text-zinc-500">
                  {player.displayName}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MapOptionPicker({
  maps,
  options,
  selectedMapIds,
  currentPoolIds,
  onToggle,
  onMove,
  onRemove,
}: {
  maps: AdminPollMap[];
  options: DraftOption[];
  selectedMapIds: string[];
  currentPoolIds: Set<string>;
  onToggle: (map: AdminPollMap) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredMaps = [...maps]
    .filter((map) =>
      `${map.displayName} ${map.slug}`.toLowerCase().includes(query.toLowerCase())
    )
    .sort(
      (left, right) =>
        Number(currentPoolIds.has(right.id)) - Number(currentPoolIds.has(left.id)) ||
        left.displayName.localeCompare(right.displayName)
    );
  return (
    <fieldset className="rounded-xl border border-white/10 p-3">
      <legend className="px-2 text-sm font-black">CoH3 map options</legend>
      <p className="text-xs leading-5 text-zinc-400">
        Any active 1v1 catalogue map is allowed. Current Division-pool maps are
        highlighted and listed first when a Division is selected.
      </p>
      <input
        type="search"
        aria-label="Search active maps"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search active maps"
        className={`${inputClass} mt-3`}
      />
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {filteredMaps.map((map) => (
          <label
            key={map.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3"
          >
            <input
              type="checkbox"
              checked={selectedMapIds.includes(map.id)}
              onChange={() => onToggle(map)}
              className="h-5 w-5 accent-orange-500"
            />
            <span className="min-w-0 flex-1 break-words text-sm font-bold">
              {map.displayName}
            </span>
            {currentPoolIds.has(map.id) ? (
              <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-1 text-[10px] font-black uppercase text-orange-200">
                Current pool
              </span>
            ) : null}
          </label>
        ))}
      </div>
      <ol className="mt-4 grid gap-2">
        {options.map((option, index) => (
          <li key={option.key} className="flex min-w-0 items-center gap-2 rounded-xl bg-white/5 p-2">
            <input type="hidden" name="mapIds" value={option.mapId ?? ""} />
            <span className="min-w-0 flex-1 break-words text-sm font-black">
              {index + 1}. {option.label}
            </span>
            <MoveButtons
              label={option.label}
              index={index}
              length={options.length}
              onMove={(direction) => onMove(index, direction)}
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove map option ${option.label}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-500/25 text-red-200"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs font-bold text-zinc-400">
        {options.length} / {POLL_LIMITS.maximumOptions} maps selected
      </p>
    </fieldset>
  );
}

function OptionEditorRow({
  index,
  length,
  label,
  onLabelChange,
  onMove,
  onRemove,
}: {
  index: number;
  length: number;
  label: string;
  onLabelChange: (label: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="min-w-0">
        <span className="sr-only">Option {index + 1} label</span>
        <input
          name="optionLabels"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          required
          maxLength={POLL_LIMITS.optionLabel}
          placeholder={`Option ${index + 1}`}
          className={inputClass}
        />
      </label>
      <div className="flex gap-2">
        <MoveButtons
          label={label || String(index + 1)}
          index={index}
          length={length}
          onMove={onMove}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={length <= 2}
          aria-label={`Remove option ${label || index + 1}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-500/25 text-red-200 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function MoveButtons({
  label,
  index,
  length,
  onMove,
}: {
  label: string;
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label={`Move option ${label} up`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowUp size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === length - 1}
        aria-label={`Move option ${label} down`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowDown size={16} aria-hidden="true" />
      </button>
    </>
  );
}

function PollListItem({
  poll,
  selected,
  contextTournamentId,
}: {
  poll: AdminPollView;
  selected: boolean;
  contextTournamentId?: string;
}) {
  const params = new URLSearchParams({ selected: poll.id });
  if (contextTournamentId) params.set("tournament", contextTournamentId);
  return (
    <Link
      href={`/admin/polls?${params.toString()}`}
      className={`group rounded-xl border p-4 transition ${
        selected
          ? "border-orange-400/50 bg-orange-500/10"
          : "border-white/10 bg-black/25 hover:border-orange-400/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-black">{poll.question}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
            {purposeLabels[poll.purpose]}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-orange-300" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={pollStatus(poll)} />
        <Badge>{poll.authority}</Badge>
      </div>
    </Link>
  );
}

function BindingWarning() {
  return (
    <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">
      <p className="flex items-start gap-2 font-black">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Binding results apply regardless of turnout once at least one valid
        ballot is submitted.
      </p>
      <p className="mt-2 text-amber-100/80">
        Top-ranked options become authoritative. Admin tie-breaking is limited
        to options tied across the qualifying cutoff. Zero-ballot polls must be
        cancelled and replaced.
      </p>
    </div>
  );
}

function AdminPollNotice({
  notice,
  detail,
  eligibleCount,
}: {
  notice: string;
  detail?: string;
  eligibleCount?: number;
}) {
  const success = [
    "draft-saved",
    "draft-deleted",
    "eligibility-preview",
    "published",
    "cancelled",
    "final-decision-published",
  ].includes(notice);
  const messages: Record<string, string> = {
    "draft-saved": "Draft saved. Preview eligibility before publication.",
    "draft-deleted": "Draft deleted.",
    "eligibility-preview": `Eligibility revalidated: ${eligibleCount ?? 0} currently qualifying players.`,
    published: `Poll published with ${eligibleCount ?? 0} frozen eligible players.`,
    cancelled: "Poll cancelled with its history preserved.",
    "final-decision-published": "Final Tournament Decision published.",
    "load-failed":
      "Required Polls & Decisions data could not be loaded. Mutations are disabled until a clean reload succeeds.",
    "invalid-draft": detail || "Enter a valid poll configuration.",
    "save-failed": "The Draft could not be saved.",
    "publish-failed": "Publication failed; no audience was frozen.",
    "preview-failed": "Eligibility could not be revalidated.",
    "cancel-failed": "The poll could not be cancelled.",
    "final-decision-failed": "The final decision could not be published.",
  };
  return (
    <p
      role="status"
      className={`mt-5 rounded-xl border p-3 text-sm font-bold ${
        success
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/30 bg-red-500/10 text-red-200"
      }`}
    >
      {messages[notice] ?? "The Polls & Decisions operation could not be completed."}
    </p>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="min-w-0">
      <span className="text-sm font-bold">{label}</span>
      <input {...props} className={inputClass} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <input
        {...props}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  ...props
}: {
  label: string;
  options: [string, string][];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <select {...props} className={inputClass}>
        {options.map(([value, optionLabel]) => (
          <option key={value} value={value}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold">{label}</p>
      <p className={`${inputClass} flex items-center text-zinc-300`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-3">
      <dt className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-zinc-200">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: PollStatus }) {
  return (
    <span className="inline-flex w-fit rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
      {statusLabels[status]}
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-300">
      {children}
    </span>
  );
}

function pollStatus(poll: AdminPollView) {
  return (
    poll.status ??
    derivePollStatus({
      publishedAt: poll.publishedAt,
      opensAt: poll.opensAt,
      closesAt: poll.closesAt,
      cancelledAt: poll.cancelledAt,
      finalDecisionPublishedAt: poll.finalDecisionPublishedAt,
    })
  );
}

function computeTopOptionIds(poll: AdminPollView) {
  return [...poll.options]
    .filter((option) => optionVoteCount(option) !== null)
    .sort(
      (left, right) =>
        (optionVoteCount(right) ?? 0) - (optionVoteCount(left) ?? 0) ||
        left.position - right.position
    )
    .slice(0, poll.winnerCount)
    .map((option) => option.id);
}

function optionVoteCount(option: AdminPollOption) {
  const value = option.voteCount ?? option.total;
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function moveItem<Value>(values: Value[], from: number, to: number) {
  if (to < 0 || to >= values.length || from === to) return values;
  const copy = [...values];
  const [value] = copy.splice(from, 1);
  copy.splice(to, 0, value);
  return copy;
}

function newTextOption(index: number): DraftOption {
  return { key: `new-option-${index}-${Date.now()}`, label: "", mapId: null };
}

function toDateTimeLocal(value: string) {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString().slice(0, 16)
    : "";
}

function formatDateTime(value: string) {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      }).format(timestamp)
    : "Unavailable";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-orange-400";
const textareaClass =
  "mt-2 w-full min-w-0 rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none transition focus:border-orange-400";
const secondaryButtonClass =
  "min-h-11 rounded-xl border border-white/15 px-5 font-black text-zinc-300 hover:text-white";
