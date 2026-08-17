"use client";

import { useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import PhysicalDice, { type DiceValue } from "@/components/PhysicalDice";
import type {
  AuthoritativeMatchDiceRoll,
  MatchDiceActivation,
  MatchDiceGame,
  MatchDiceGameNumber,
  MatchDiceParticipantSlot,
  MatchDiceReadOnlyReason,
  MatchDiceRollActionResult,
  MatchDiceRollOffSnapshot,
  RollMatchDiceInput,
} from "@/lib/match-dice";
import styles from "./PhysicalDice.module.css";

export type { MatchDiceRollOffSnapshot } from "@/lib/match-dice";

export type MatchDiceLoadResult =
  | { ok: true; snapshot: MatchDiceRollOffSnapshot }
  | { ok: false; message: string };

export type MatchDiceRollResult = MatchDiceRollActionResult;

export type MatchDiceRollOffProps = {
  matchId: string;
  initialSnapshot?: MatchDiceRollOffSnapshot | null;
  loadSnapshot: (
    matchId: string,
    signal?: AbortSignal
  ) => Promise<MatchDiceLoadResult>;
  rollDice: (input: RollMatchDiceInput) => Promise<MatchDiceRollResult>;
  pollIntervalMs?: number;
  forceReadOnly?: boolean;
  onSnapshotChange?: (snapshot: MatchDiceRollOffSnapshot) => void;
};

const GAME_NUMBERS: MatchDiceGameNumber[] = [1, 3, 5];
const READ_ONLY_COPY: Record<MatchDiceReadOnlyReason, string> = {
  unsupported_format:
    "Dice Roll-Off is available only for launched single-elimination Matches.",
  division_not_launched: "This Division has not launched.",
  tournament_not_in_progress:
    "Tournament is not in progress. Dice history is read-only.",
  match_not_in_progress: "This Match is not in progress. Dice history is read-only.",
  participants_unavailable: "Both Match participants must be assigned.",
  activation_unavailable: "This Match does not have a current activation.",
  official_outcome: "The official Match outcome is already recorded.",
  admin_hold: "This Match is on an administrative hold.",
  deadline_elapsed: "The Match deadline has elapsed.",
};
const DUST_PARTICLES = [
  { x: "-48px", drift: "-22px" },
  { x: "-30px", drift: "13px" },
  { x: "-10px", drift: "-16px" },
  { x: "12px", drift: "18px" },
  { x: "32px", drift: "-10px" },
  { x: "48px", drift: "21px" },
];

function isVisibleAndOnline() {
  return (
    document.visibilityState !== "hidden" &&
    (typeof navigator === "undefined" || navigator.onLine !== false)
  );
}

function getCurrentActivation(snapshot: MatchDiceRollOffSnapshot) {
  return (
    snapshot.activations.find(
      (activation) =>
        activation.isCurrent &&
        activation.activationVersion === snapshot.currentActivationVersion
    ) ??
    snapshot.activations.find(
      (activation) =>
        activation.activationVersion === snapshot.currentActivationVersion
    ) ??
    null
  );
}

function getAvailableGames(
  activation: MatchDiceActivation | null,
  seriesBestOf: 3 | 5
) {
  if (!activation) return [];

  return activation.games
    .filter(
      (game) =>
        GAME_NUMBERS.includes(game.gameNumber) &&
        (game.gameNumber !== 5 || seriesBestOf === 5)
    )
    .sort((first, second) => first.gameNumber - second.gameNumber);
}

function getLatestRoll(game: MatchDiceGame | null) {
  if (!game) return null;

  const orderedRounds = [...game.rounds].sort(
    (first, second) => first.tieRound - second.tieRound
  );
  const activeRound =
    orderedRounds.find(
      (round) => round.tieRound === game.currentTieRound
    ) ?? orderedRounds.at(-1);

  if (!activeRound) return null;
  const roll = [...activeRound.rolls]
    .sort(
      (first, second) =>
        Date.parse(first.rolledAt) - Date.parse(second.rolledAt)
    )
    .at(-1);
  return roll ? { ...roll, tieRound: activeRound.tieRound } : null;
}

function getParticipantLabel(
  snapshot: MatchDiceRollOffSnapshot,
  slot: MatchDiceParticipantSlot | null
) {
  if (!slot) return null;
  return (
    snapshot.participants.find((participant) => participant.slot === slot)
      ?.label ?? null
  );
}

function getReadOnlyCopy(reason: MatchDiceReadOnlyReason | null) {
  return reason ? READ_ONLY_COPY[reason] : "Dice history is read-only.";
}

function getGameStatusLabel(
  game: MatchDiceGame,
  viewerSlot: MatchDiceParticipantSlot | null,
  rollingUnavailable: boolean
) {
  if (game.state === "complete") return "Complete";
  if (game.state === "tied") {
    return rollingUnavailable ? "Tie" : "Tie — reroll";
  }
  if (game.state === "waiting") {
    if (rollingUnavailable) return "Waiting";
    const currentRound = game.rounds.find(
      (round) => round.tieRound === game.currentTieRound
    );
    const viewerHasRolled = currentRound?.rolls.some(
      (roll) => roll.participantSlot === viewerSlot
    );
    return viewerHasRolled ? "Waiting" : "Your roll";
  }
  if (rollingUnavailable) return "Open";
  return game.canRoll ? "Ready" : "Open";
}

function getLiveStatus(
  snapshot: MatchDiceRollOffSnapshot,
  activation: MatchDiceActivation | null,
  game: MatchDiceGame | null,
  forceReadOnly: boolean
) {
  if (!activation || !game) return "Dice history unavailable";
  if (!activation.isCurrent) return "Archived activation — read-only";
  if (game.state === "complete") {
    return snapshot.viewerSlot && game.winnerSlot === snapshot.viewerSlot
      ? "Roll-off won"
      : snapshot.viewerSlot
        ? "Roll-off lost"
        : "Roll-off complete";
  }
  if (snapshot.viewerRole === "admin") {
    return "Admin read-only inspection";
  }
  if (forceReadOnly) {
    return getReadOnlyCopy(snapshot.readOnlyReason);
  }
  if (!snapshot.isActionable) {
    return getReadOnlyCopy(snapshot.readOnlyReason);
  }
  if (game.state === "tied") return "Tie — reroll required";
  if (game.state === "waiting") {
    const currentRound = game.rounds.find(
      (round) => round.tieRound === game.currentTieRound
    );
    return currentRound?.rolls.some(
      (roll) => roll.participantSlot === snapshot.viewerSlot
    )
      ? "Waiting for opponent"
      : "Your roll is ready";
  }
  return game.canRoll ? "Ready to roll" : "Waiting for opponent";
}

function formatRollTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function MatchDiceRollOff({
  matchId,
  initialSnapshot = null,
  loadSnapshot,
  rollDice,
  pollIntervalMs = 2_000,
  forceReadOnly = false,
  onSnapshotChange,
}: MatchDiceRollOffProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [snapshot, setSnapshot] =
    useState<MatchDiceRollOffSnapshot | null>(initialSnapshot);
  const [selectedActivationVersion, setSelectedActivationVersion] = useState<
    number | null
  >(initialSnapshot?.currentActivationVersion ?? null);
  const [selectedGameNumber, setSelectedGameNumber] =
    useState<MatchDiceGameNumber>(1);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [animationKey, setAnimationKey] = useState<string | null>(null);
  const [animatedRoll, setAnimatedRoll] =
    useState<AuthoritativeMatchDiceRoll | null>(null);
  const mountedRef = useRef(false);
  const readInFlightRef = useRef(false);
  const activeReadControllerRef = useRef<AbortController | null>(null);
  const rollingRef = useRef(false);
  const mutationRevisionRef = useRef(0);
  const readSequenceRef = useRef(0);
  const appliedReadSequenceRef = useRef(0);
  const currentActivationVersionRef = useRef<number | null>(
    initialSnapshot?.currentActivationVersion ?? null
  );
  const animationTimerRef = useRef<number | null>(null);
  const tabRefs = useRef<Partial<Record<MatchDiceGameNumber, HTMLButtonElement>>>({});

  const applySnapshot = useCallback(
    (nextSnapshot: MatchDiceRollOffSnapshot) => {
      if (!mountedRef.current) return;
      const previousCurrentActivationVersion =
        currentActivationVersionRef.current;
      currentActivationVersionRef.current =
        nextSnapshot.currentActivationVersion;
      setSnapshot(nextSnapshot);
      setSelectedActivationVersion((selected) => {
        if (
          selected === null ||
          selected === previousCurrentActivationVersion
        ) {
          return nextSnapshot.currentActivationVersion;
        }
        if (
          nextSnapshot.activations.some(
            (activation) => activation.activationVersion === selected
          )
        ) {
          return selected;
        }
        return nextSnapshot.currentActivationVersion;
      });
      onSnapshotChange?.(nextSnapshot);
    },
    [onSnapshotChange]
  );

  const refreshSnapshot = useCallback(
    async ({
      force = false,
      surfaceError = false,
    }: {
      force?: boolean;
      surfaceError?: boolean;
    } = {}) => {
      if (!mountedRef.current || (!force && !isVisibleAndOnline())) {
        return null;
      }

      if (readInFlightRef.current) {
        if (!force) return null;
        activeReadControllerRef.current?.abort();
      }

      const mutationRevision = mutationRevisionRef.current;
      const sequence = ++readSequenceRef.current;
      const controller = new AbortController();
      activeReadControllerRef.current = controller;
      readInFlightRef.current = true;

      try {
        const result = await loadSnapshot(matchId, controller.signal);
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          mutationRevision !== mutationRevisionRef.current ||
          sequence < appliedReadSequenceRef.current
        ) {
          return null;
        }

        appliedReadSequenceRef.current = sequence;
        if (result.ok) {
          applySnapshot(result.snapshot);
          setMessage(null);
          return true;
        } else if (surfaceError) {
          setMessage(result.message);
        }
        return false;
      } catch {
        if (controller.signal.aborted) return null;
        if (surfaceError && mountedRef.current) {
          setMessage("Dice history could not be loaded. Please try again.");
        }
        return false;
      } finally {
        if (activeReadControllerRef.current === controller) {
          activeReadControllerRef.current = null;
          readInFlightRef.current = false;
          if (mountedRef.current) setLoading(false);
        }
      }
    },
    [applySnapshot, loadSnapshot, matchId]
  );

  useEffect(() => {
    mountedRef.current = true;
    const initialLoadTimer = window.setTimeout(() => {
      void refreshSnapshot({ force: true, surfaceError: true });
    }, 0);

    return () => {
      mountedRef.current = false;
      activeReadControllerRef.current?.abort();
      activeReadControllerRef.current = null;
      readInFlightRef.current = false;
      window.clearTimeout(initialLoadTimer);
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
    };
  }, [refreshSnapshot]);

  const currentActivation = useMemo(
    () => (snapshot ? getCurrentActivation(snapshot) : null),
    [snapshot]
  );
  const selectedActivation = useMemo(() => {
    if (!snapshot) return null;
    return (
      snapshot.activations.find(
        (activation) =>
          activation.activationVersion === selectedActivationVersion
      ) ?? currentActivation
    );
  }, [currentActivation, selectedActivationVersion, snapshot]);
  const availableGames = useMemo(
    () =>
      getAvailableGames(selectedActivation, snapshot?.seriesBestOf ?? 3),
    [selectedActivation, snapshot?.seriesBestOf]
  );
  const resolvedGameNumber = availableGames.some(
    (game) => game.gameNumber === selectedGameNumber
  )
    ? selectedGameNumber
    : availableGames[0]?.gameNumber ?? 1;
  const selectedGame =
    availableGames.find((game) => game.gameNumber === resolvedGameNumber) ??
    null;
  const pollEligible = Boolean(
    snapshot &&
      snapshot.isActionable &&
      selectedActivation?.isCurrent &&
      selectedGame &&
      selectedGame.state !== "complete"
  );
  const pollEligibleRef = useRef(pollEligible);

  useEffect(() => {
    pollEligibleRef.current = pollEligible;
  }, [pollEligible]);

  useEffect(() => {
    if (!pollEligible) return;

    let cancelled = false;
    let timer: number | null = null;

    let consecutiveFailures = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (pollEligibleRef.current && isVisibleAndOnline()) {
          const refreshed = await refreshSnapshot();
          if (refreshed === true) consecutiveFailures = 0;
          if (refreshed === false) consecutiveFailures += 1;
        }
        if (!cancelled && pollEligibleRef.current) {
          schedule(
            Math.min(
              pollIntervalMs * 2 ** consecutiveFailures,
              Math.max(pollIntervalMs, 10_000)
            )
          );
        }
      }, delay);
    };

    schedule(pollIntervalMs);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pollEligible, pollIntervalMs, refreshSnapshot]);

  useEffect(() => {
    const refreshIfActive = () => {
      if (isVisibleAndOnline()) {
        void refreshSnapshot();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") refreshIfActive();
    };

    window.addEventListener("focus", refreshIfActive);
    window.addEventListener("pageshow", refreshIfActive);
    window.addEventListener("online", refreshIfActive);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshIfActive);
      window.removeEventListener("pageshow", refreshIfActive);
      window.removeEventListener("online", refreshIfActive);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshSnapshot]);

  const previousGameRef = useRef(selectedGameNumber);
  useEffect(() => {
    if (previousGameRef.current === selectedGameNumber) return;
    previousGameRef.current = selectedGameNumber;
    const refreshTimer = window.setTimeout(() => {
      if (isVisibleAndOnline()) {
        void refreshSnapshot();
      }
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshSnapshot, selectedGameNumber]);

  const clearActiveAnimation = useCallback(() => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    setAnimationKey(null);
    setAnimatedRoll(null);
  }, []);

  const selectGame = useCallback(
    (gameNumber: MatchDiceGameNumber) => {
      clearActiveAnimation();
      setSelectedGameNumber(gameNumber);
      setMessage(null);
    },
    [clearActiveAnimation]
  );

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    gameNumber: MatchDiceGameNumber
  ) => {
    const index = availableGames.findIndex(
      (game) => game.gameNumber === gameNumber
    );
    if (index < 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % availableGames.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + availableGames.length) % availableGames.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = availableGames.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextGame = availableGames[nextIndex].gameNumber;
    selectGame(nextGame);
    tabRefs.current[nextGame]?.focus();
  };

  const handleRoll = async () => {
    if (
      rollingRef.current ||
      forceReadOnly ||
      !snapshot ||
      snapshot.viewerRole !== "participant" ||
      !snapshot.viewerSlot ||
      !snapshot.isActionable ||
      !selectedActivation?.isCurrent ||
      !selectedGame?.canRoll
    ) {
      return;
    }

    rollingRef.current = true;
    setRolling(true);
    setMessage(null);
    const input: RollMatchDiceInput = {
      matchId,
      expectedActivationVersion: selectedActivation.activationVersion,
      gameNumber: selectedGame.gameNumber,
      expectedTieRound: selectedGame.currentTieRound,
    };

    try {
      const result = await rollDice(input);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setMessage(result.error);
        void refreshSnapshot({ force: true });
        return;
      }

      mutationRevisionRef.current += 1;
      applySnapshot(result.data.snapshot);
      if (result.data.roll.created) {
        const nextAnimationKey = [
          matchId,
          result.data.roll.activationVersion,
          result.data.roll.gameNumber,
          result.data.roll.tieRound,
          result.data.roll.participantSlot,
        ].join(":");
        setAnimatedRoll(result.data.roll);
        setAnimationKey(nextAnimationKey);
        if (animationTimerRef.current !== null) {
          window.clearTimeout(animationTimerRef.current);
        }
        animationTimerRef.current = window.setTimeout(() => {
          setAnimationKey(null);
          setAnimatedRoll(null);
          animationTimerRef.current = null;
        }, reduceMotion ? 180 : 1_400);
      }
      void refreshSnapshot({ force: true });
    } catch {
      if (mountedRef.current) {
        setMessage(
          "IronClad could not confirm the roll response. Refresh this Match before retrying."
        );
      }
    } finally {
      rollingRef.current = false;
      if (mountedRef.current) setRolling(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div
        role="status"
        className="min-h-48 border border-orange-400/20 bg-black/60 p-6 text-sm text-zinc-300"
      >
        Loading Dice Roll-Off…
      </div>
    );
  }

  if (snapshot?.activations.length === 0 && snapshot.readOnlyReason) {
    return (
      <section
        aria-label="Match Dice Roll-Off"
        className="border border-zinc-700 bg-black/60 p-6"
      >
        <p className="font-mono text-xs font-black uppercase tracking-wider text-orange-200">
          Dice Roll-Off unavailable
        </p>
        <p role="status" className="mt-3 text-sm text-zinc-300">
          {getReadOnlyCopy(snapshot.readOnlyReason)}
        </p>
      </section>
    );
  }

  if (!snapshot || !selectedActivation || !selectedGame) {
    return (
      <section
        aria-label="Match Dice Roll-Off"
        className="border border-zinc-700 bg-black/60 p-6"
      >
        <p role="alert" className="text-sm text-amber-200">
          {message ?? "Dice history is unavailable for this Match."}
        </p>
        <button
          type="button"
          onClick={() => void refreshSnapshot({ force: true, surfaceError: true })}
          className="mt-4 min-h-11 border border-orange-400/40 px-4 text-xs font-black uppercase tracking-wider text-orange-100"
        >
          Retry
        </button>
      </section>
    );
  }

  const latestRoll = getLatestRoll(selectedGame);
  const animationMatchesSelection = Boolean(
    animationKey &&
      animatedRoll &&
      animatedRoll.activationVersion === selectedActivation.activationVersion &&
      animatedRoll.gameNumber === selectedGame.gameNumber
  );
  const trayRoll = animationMatchesSelection ? animatedRoll : latestRoll;
  const visibleRounds =
    animationMatchesSelection && animatedRoll
      ? selectedGame.rounds
          .map((round) =>
            round.tieRound === animatedRoll.tieRound
              ? {
                  ...round,
                  rolls: round.rolls.filter(
                    (roll) =>
                      roll.participantSlot !== animatedRoll.participantSlot ||
                      roll.rolledAt !== animatedRoll.rolledAt
                  ),
                }
              : round
          )
          .filter((round) => round.rolls.length > 0)
      : selectedGame.rounds;
  const liveStatus = getLiveStatus(
    snapshot,
    selectedActivation,
    selectedGame,
    forceReadOnly
  );
  const rollingUnavailable = Boolean(
    forceReadOnly ||
      snapshot.viewerRole !== "participant" ||
      !snapshot.viewerSlot ||
      !snapshot.isActionable ||
      !selectedActivation.isCurrent
  );
  const canRoll = Boolean(
    !rollingUnavailable &&
      !animationMatchesSelection &&
      selectedGame.canRoll
  );
  const winningLabel = getParticipantLabel(
    snapshot,
    selectedGame.winnerSlot
  );

  return (
    <section
      aria-label="Match Dice Roll-Off"
      className={`${styles.commandTable} p-4 sm:p-6 lg:p-8`}
    >
      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400">
              Authenticated Match Tool
            </p>
            <h2 className="mt-2 text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
              Dice Roll-Off
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400 sm:text-sm">
              Server-generated 2d6. Stored results are immutable Match facts and
              do not change the official Series result.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {snapshot.viewerRole === "admin" && (
              <span className="border border-sky-400/30 bg-sky-400/10 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-sky-200">
                Admin read-only inspection
              </span>
            )}
            {forceReadOnly && snapshot.viewerRole !== "admin" && (
              <span className="border border-sky-400/30 bg-sky-400/10 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-sky-200">
                Read-only Match history
              </span>
            )}
            <span className="border border-orange-400/25 bg-orange-400/[0.07] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-orange-200">
              Activation {selectedActivation.activationVersion}
              {selectedActivation.isCurrent ? " · Current" : " · Archived"}
            </span>
          </div>
        </div>

        {snapshot.activations.length > 1 && (
          <label className="mt-5 block max-w-xs text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            Dice activation
            <select
              aria-label="Dice activation"
              value={selectedActivation.activationVersion}
              onChange={(event) => {
                clearActiveAnimation();
                setSelectedActivationVersion(Number(event.target.value));
                setMessage(null);
              }}
              className="mt-2 min-h-11 w-full border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
            >
              {[...snapshot.activations]
                .sort(
                  (first, second) =>
                    second.activationVersion - first.activationVersion
                )
                .map((activation) => (
                  <option
                    key={activation.activationVersion}
                    value={activation.activationVersion}
                  >
                    Activation {activation.activationVersion}
                    {activation.isCurrent ? " — Current" : " — Archived"}
                  </option>
                ))}
            </select>
          </label>
        )}

        <div
          role="tablist"
          aria-label="Dice Roll-Off Games"
          className={`mt-6 grid gap-2 ${availableGames.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {availableGames.map((game) => {
            const selected = game.gameNumber === selectedGame.gameNumber;
            const status =
              selected && animationMatchesSelection
                ? "Rolling"
                : getGameStatusLabel(
                    game,
                    snapshot.viewerSlot,
                    rollingUnavailable
                  );
            return (
              <button
                key={game.gameNumber}
                ref={(element) => {
                  tabRefs.current[game.gameNumber] = element ?? undefined;
                }}
                id={`dice-game-${game.gameNumber}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`dice-game-${game.gameNumber}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectGame(game.gameNumber)}
                onKeyDown={(event) =>
                  handleTabKeyDown(event, game.gameNumber)
                }
                className={`min-h-12 border px-2 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-orange-300 sm:px-4 ${
                  selected
                    ? "border-orange-400/70 bg-orange-500/15 text-orange-50"
                    : "border-zinc-700 bg-black/40 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                <span className="block font-mono text-xs font-black uppercase tracking-wider">
                  Game {game.gameNumber}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      selected && animationMatchesSelection
                        ? "bg-orange-300"
                        : game.state === "complete"
                        ? "bg-emerald-400"
                        : game.state === "tied"
                          ? "bg-amber-300"
                          : game.state === "waiting"
                            ? "bg-sky-300"
                            : "bg-orange-400"
                    }`}
                  />
                  {status}
                </span>
              </button>
            );
          })}
        </div>

        <div
          id={`dice-game-${selectedGame.gameNumber}-panel`}
          role="tabpanel"
          aria-labelledby={`dice-game-${selectedGame.gameNumber}-tab`}
          className="mt-5 outline-none"
        >
          {selectedGame.gameNumber === 3 && (
            <p className="mb-4 border-l-2 border-amber-400/60 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/85">
              {rollingUnavailable
                ? "Any stored roll-off applies only if the Series reaches Game 3."
                : "You may roll now or later. This result applies only if the Series reaches Game 3."}
            </p>
          )}
          {selectedGame.gameNumber === 5 && (
            <p className="mb-4 border-l-2 border-amber-400/60 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/85">
              {rollingUnavailable
                ? "Any stored roll-off applies only if the Series reaches Game 5."
                : "You may roll now or later. This result applies only if the Series reaches Game 5."}
            </p>
          )}

          <div
            className={`${styles.tray} ${animationMatchesSelection && !reduceMotion ? styles.trayImpact : ""}`}
          >
            <div className="absolute left-4 top-4 z-10 font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">
              G-{selectedGame.gameNumber} / R-
              {trayRoll?.tieRound ?? selectedGame.currentTieRound}
            </div>
            {trayRoll ? (
              <div className={styles.dicePair}>
                <PhysicalDice
                  value={trayRoll.die1 as DiceValue}
                  label="First die"
                  animationKey={animationMatchesSelection ? animationKey : null}
                  dieIndex={0}
                />
                <PhysicalDice
                  value={trayRoll.die2 as DiceValue}
                  label="Second die"
                  animationKey={animationMatchesSelection ? animationKey : null}
                  dieIndex={1}
                />
              </div>
            ) : (
              <div className="relative z-10 px-5 text-center">
                <span className="mx-auto block h-14 w-14 rounded-full border border-dashed border-orange-400/25" />
                <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {rollingUnavailable
                    ? "No roll recorded"
                    : "Awaiting roll authorization"}
                </p>
              </div>
            )}
            {animationMatchesSelection &&
              !reduceMotion &&
              DUST_PARTICLES.map((particle, index) => (
                <span
                  key={`${animationKey}:dust:${index}`}
                  aria-hidden="true"
                  className={styles.dust}
                  style={
                    {
                      "--dust-x": particle.x,
                      "--dust-drift": particle.drift,
                    } as CSSProperties
                  }
                />
              ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 border border-zinc-800 bg-black/45 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div role="status" aria-live="polite" aria-atomic="true">
              <p className="font-mono text-sm font-black uppercase tracking-wider text-orange-100">
                {animationMatchesSelection
                  ? "Authoritative dice received. Rolling."
                  : liveStatus}
              </p>
              {!animationMatchesSelection && latestRoll && (
                <p className="mt-1 text-lg font-black tabular-nums text-white">
                  {latestRoll.die1} + {latestRoll.die2} = {latestRoll.total}
                </p>
              )}
              {!animationMatchesSelection &&
                selectedGame.state === "complete" &&
                winningLabel && (
                  <p className="mt-1 text-xs text-zinc-400">
                    Roll-off winner: {winningLabel}. This is not the Series
                    result.
                  </p>
                )}
            </div>

            {canRoll && (
              <button
                type="button"
                onClick={() => void handleRoll()}
                disabled={rolling}
                className="min-h-12 min-w-40 border border-orange-300/60 bg-orange-500 px-5 font-mono text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_0_24px_rgba(249,115,22,0.2)] transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 disabled:cursor-wait disabled:opacity-60"
              >
                {rolling ? "Authorizing…" : "Roll Dice"}
              </button>
            )}
          </div>

          {(snapshot.readOnlyReason || !selectedActivation.isCurrent) && (
            <p className="mt-3 border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-xs leading-5 text-zinc-300">
              {!selectedActivation.isCurrent
                ? "Archived activation. Stored rolls are read-only."
                : getReadOnlyCopy(snapshot.readOnlyReason)}
            </p>
          )}
          {message && (
            <p
              role="alert"
              className="mt-3 border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-100"
            >
              {message}
            </p>
          )}

          <div className="mt-6 space-y-3" aria-label="Immutable roll history">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-zinc-200">
                Immutable roll history
              </h3>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                Server timestamped
              </span>
            </div>

            {visibleRounds.length === 0 ? (
              <p className="border border-dashed border-zinc-700 p-4 text-xs text-zinc-500">
                No rolls have been stored for this Game and activation.
              </p>
            ) : (
              [...visibleRounds]
                .sort((first, second) => first.tieRound - second.tieRound)
                .map((round) => {
                  const totals = round.rolls.map((roll) => roll.total);
                  const isTie =
                    totals.length === 2 && totals[0] === totals[1];
                  return (
                    <article
                      key={round.tieRound}
                      className="border border-zinc-800 bg-zinc-950/65 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <h4 className="font-mono text-[11px] font-black uppercase tracking-wider text-orange-200">
                          Tie round {round.tieRound}
                        </h4>
                        {isTie && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                            Tied — next round unlocked
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {snapshot.participants.map((participant) => {
                          const roll = round.rolls.find(
                            (entry) =>
                              entry.participantSlot === participant.slot
                          );
                          return (
                            <div
                              key={participant.slot}
                              className="min-w-0 border border-zinc-800 bg-black/45 p-3"
                            >
                              <p className="break-words text-xs font-bold text-zinc-200 [overflow-wrap:anywhere]">
                                {participant.label}
                              </p>
                              {roll ? (
                                <>
                                  <p className="mt-2 font-mono text-base font-black tabular-nums text-white">
                                    {roll.die1} + {roll.die2} = {roll.total}
                                  </p>
                                  <time
                                    dateTime={roll.rolledAt}
                                    className="mt-1 block text-[10px] text-zinc-500"
                                  >
                                    {formatRollTimestamp(roll.rolledAt)}
                                  </time>
                                </>
                              ) : (
                                <p className="mt-2 text-xs text-zinc-600">
                                  Awaiting roll
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
