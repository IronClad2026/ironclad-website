// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import MatchDiceRollOff, {
  type MatchDiceLoadResult,
  type MatchDiceRollOffSnapshot,
  type MatchDiceRollResult,
} from "@/components/MatchDiceRollOff";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { translate } from "@/lib/i18n/translate";
import type { RollMatchDiceInput } from "@/lib/match-dice";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";

function makeSnapshot(
  overrides: Partial<MatchDiceRollOffSnapshot> = {}
): MatchDiceRollOffSnapshot {
  return {
    matchId: MATCH_ID,
    currentActivationVersion: 3,
    seriesBestOf: 3,
    viewerRole: "participant",
    viewerSlot: "player_one",
    isActionable: true,
    readOnlyReason: null,
    participants: [
      { slot: "player_one", label: "Able Company" },
      { slot: "player_two", label: "Baker Company" },
    ],
    activations: [
      {
        activationVersion: 3,
        isCurrent: true,
        games: [
          {
            gameNumber: 1,
            currentTieRound: 1,
            state: "open",
            canRoll: true,
            winnerSlot: null,
            rounds: [],
          },
          {
            gameNumber: 3,
            currentTieRound: 1,
            state: "waiting",
            canRoll: true,
            winnerSlot: null,
            rounds: [
              {
                tieRound: 1,
                rolls: [
                  {
                    participantSlot: "player_two",
                    participantLabel: "Baker Company",
                    die1: 5,
                    die2: 3,
                    total: 8,
                    rolledAt: "2026-08-17T01:02:03.000Z",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function success(snapshot: MatchDiceRollOffSnapshot): MatchDiceLoadResult {
  return { ok: true, snapshot };
}

function renderRollOff({
  snapshot = makeSnapshot(),
  loadSnapshot = vi.fn(async () => success(snapshot ?? makeSnapshot())),
  rollDice = vi.fn(),
  pollIntervalMs = 2_000,
  forceReadOnly = false,
}: {
  snapshot?: MatchDiceRollOffSnapshot | null;
  loadSnapshot?: (
    matchId: string,
    signal?: AbortSignal
  ) => Promise<MatchDiceLoadResult>;
  rollDice?: (
    input: Parameters<NonNullable<React.ComponentProps<typeof MatchDiceRollOff>["rollDice"]>>[0]
  ) => Promise<MatchDiceRollResult>;
  pollIntervalMs?: number;
  forceReadOnly?: boolean;
} = {}) {
  return {
    loadSnapshot,
    rollDice,
    ...render(
      <MatchDiceRollOff
        matchId={MATCH_ID}
        initialSnapshot={snapshot}
        loadSnapshot={loadSnapshot}
        rollDice={rollDice}
        pollIntervalMs={pollIntervalMs}
        forceReadOnly={forceReadOnly}
      />
    ),
  };
}

describe("MatchDiceRollOff", () => {
  beforeEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("loads private history on open and exposes accessible independent Game tabs", async () => {
    const { loadSnapshot } = renderRollOff({ snapshot: null });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Dice Roll-Off"
    );
    await screen.findByRole("region", { name: "Match Dice Roll-Off" });
    const firstLoadCall = vi.mocked(loadSnapshot).mock.calls[0];
    expect(firstLoadCall[0]).toBe(MATCH_ID);
    expect(firstLoadCall[1]).toBeInstanceOf(AbortSignal);
    expect(screen.getByRole("tab", { name: /Game 1/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /Game 3/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Game 5/i })).not
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Game 3/i }));
    expect(
      screen.getByText(
        "You may roll now or later. This result applies only if the Series reaches Game 3."
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("5 + 3 = 8")).not.toHaveLength(0);
    expect(screen.getAllByText("Baker Company")).not.toHaveLength(0);
    expect(screen.getByText(/17 Aug 2026/i)).toBeInTheDocument();
  });

  it("offers BO5 Game 5 with advance-roll copy and keyboard-operable tabs", () => {
    const snapshot = makeSnapshot({
      seriesBestOf: 5,
      activations: [
        {
          ...makeSnapshot().activations[0],
          games: [
            ...makeSnapshot().activations[0].games,
            {
              gameNumber: 5,
              currentTieRound: 1,
              state: "open",
              canRoll: true,
              winnerSlot: null,
              rounds: [],
            },
          ],
        },
      ],
    });
    renderRollOff({ snapshot });

    const gameOne = screen.getByRole("tab", { name: /Game 1/i });
    gameOne.focus();
    fireEvent.keyDown(gameOne, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Game 3/i })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "End",
    });
    expect(screen.getByRole("tab", { name: /Game 5/i })).toHaveFocus();
    expect(
      screen.getByText(
        "You may roll now or later. This result applies only if the Series reaches Game 5."
      )
    ).toBeInTheDocument();
  });

  it("submits only the four authorized scalar fields and ignores rapid duplicate clicks", async () => {
    vi.useFakeTimers();
    let resolveRoll!: (value: MatchDiceRollResult) => void;
    const rolledSnapshot = makeSnapshot({
      activations: [
        {
          ...makeSnapshot().activations[0],
          games: [
            {
              gameNumber: 1,
              currentTieRound: 1,
              state: "waiting",
              canRoll: false,
              winnerSlot: null,
              rounds: [
                {
                  tieRound: 1,
                  rolls: [
                    {
                      participantSlot: "player_one",
                      participantLabel: "Able Company",
                      die1: 6,
                      die2: 2,
                      total: 8,
                      rolledAt: "2026-08-17T02:00:00.000Z",
                    },
                  ],
                },
              ],
            },
            makeSnapshot().activations[0].games[1],
          ],
        },
      ],
    });
    const rollDice = vi.fn<
      (input: RollMatchDiceInput) => Promise<MatchDiceRollResult>
    >(
      () =>
        new Promise<MatchDiceRollResult>((resolve) => {
          resolveRoll = resolve;
        })
    );
    renderRollOff({
      rollDice,
      loadSnapshot: vi.fn(async () => success(rolledSnapshot)),
    });

    const button = screen.getByRole("button", { name: "Roll Dice" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(rollDice).toHaveBeenCalledOnce();
    expect(rollDice).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      expectedActivationVersion: 3,
      gameNumber: 1,
      expectedTieRound: 1,
    });
    expect(rollDice.mock.calls[0][0]).not.toHaveProperty("participantSlot");
    expect(rollDice.mock.calls[0][0]).not.toHaveProperty("die1");
    expect(button).toHaveTextContent("Authorizing");

    resolveRoll({
      ok: true,
      data: {
        snapshot: rolledSnapshot,
        roll: {
          activationVersion: 3,
          gameNumber: 1,
          tieRound: 1,
          participantSlot: "player_one",
          die1: 6,
          die2: 2,
          total: 8,
          rolledAt: "2026-08-17T02:00:00.000Z",
          created: true,
        },
      },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("6 + 2 = 8")).not.toBeInTheDocument();
    expect(screen.getByLabelText("First die: 6")).toHaveAttribute(
      "data-animating",
      "true"
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Authoritative dice received. Rolling."
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_399);
    });
    expect(screen.queryByText("6 + 2 = 8")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getAllByText("6 + 2 = 8")).not.toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for opponent"
    );
    expect(screen.getByRole("status")).toHaveTextContent("6 + 2 = 8");
  });

  it("does not replay animation for an idempotent retry or a polling refresh", async () => {
    const rolledSnapshot = makeSnapshot({
      activations: [
        {
          ...makeSnapshot().activations[0],
          games: [
            {
              gameNumber: 1,
              currentTieRound: 1,
              state: "waiting",
              canRoll: false,
              winnerSlot: null,
              rounds: [
                {
                  tieRound: 1,
                  rolls: [
                    {
                      participantSlot: "player_one",
                      participantLabel: "Able Company",
                      die1: 4,
                      die2: 2,
                      total: 6,
                      rolledAt: "2026-08-17T02:00:00.000Z",
                    },
                  ],
                },
              ],
            },
            makeSnapshot().activations[0].games[1],
          ],
        },
      ],
    });
    const rollDice = vi.fn(async (): Promise<MatchDiceRollResult> => ({
      ok: true,
      data: {
        snapshot: rolledSnapshot,
        roll: {
          activationVersion: 3,
          gameNumber: 1,
          tieRound: 1,
          participantSlot: "player_one",
          die1: 4,
          die2: 2,
          total: 6,
          rolledAt: "2026-08-17T02:00:00.000Z",
          created: false,
        },
      },
    }));
    renderRollOff({
      rollDice,
      loadSnapshot: vi.fn(async () => success(rolledSnapshot)),
    });

    fireEvent.click(screen.getByRole("button", { name: "Roll Dice" }));
    expect(await screen.findAllByText("4 + 2 = 6")).not.toHaveLength(0);
    expect(screen.getByLabelText("First die: 4")).toHaveAttribute(
      "data-animating",
      "false"
    );
  });

  it("keeps a newly opened tie round locked until the tied roll settles", async () => {
    vi.useFakeTimers();
    const baseSnapshot = makeSnapshot();
    const opponentRoll = {
      participantSlot: "player_two" as const,
      participantLabel: "Baker Company",
      die1: 4,
      die2: 4,
      total: 8,
      rolledAt: "2026-08-17T02:00:00.000Z",
    };
    const viewerRoll = {
      participantSlot: "player_one" as const,
      participantLabel: "Able Company",
      die1: 5,
      die2: 3,
      total: 8,
      rolledAt: "2026-08-17T02:00:01.000Z",
    };
    const waitingSnapshot = makeSnapshot({
      activations: [
        {
          ...baseSnapshot.activations[0],
          games: [
            {
              ...baseSnapshot.activations[0].games[0],
              state: "waiting",
              canRoll: true,
              rounds: [{ tieRound: 1, rolls: [opponentRoll] }],
            },
            baseSnapshot.activations[0].games[1],
          ],
        },
      ],
    });
    const tiedSnapshot = makeSnapshot({
      activations: [
        {
          ...baseSnapshot.activations[0],
          games: [
            {
              ...baseSnapshot.activations[0].games[0],
              currentTieRound: 2,
              state: "tied",
              canRoll: true,
              rounds: [
                { tieRound: 1, rolls: [opponentRoll, viewerRoll] },
              ],
            },
            baseSnapshot.activations[0].games[1],
          ],
        },
      ],
    });
    const loadSnapshot = vi
      .fn<() => Promise<MatchDiceLoadResult>>()
      .mockResolvedValueOnce(success(waitingSnapshot))
      .mockResolvedValue(success(tiedSnapshot));
    const rollDice = vi.fn(async (): Promise<MatchDiceRollResult> => ({
      ok: true,
      data: {
        snapshot: tiedSnapshot,
        roll: {
          activationVersion: 3,
          gameNumber: 1,
          tieRound: 1,
          participantSlot: "player_one",
          die1: 5,
          die2: 3,
          total: 8,
          rolledAt: viewerRoll.rolledAt,
          created: true,
        },
      },
    }));

    renderRollOff({
      snapshot: waitingSnapshot,
      loadSnapshot,
      rollDice,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Roll Dice" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("tab", { name: /Game 1\s*Rolling/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll Dice" })).not
      .toBeInTheDocument();
    expect(screen.getByText(/G-1 \/ R-1/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_400);
    });
    expect(screen.getByRole("button", { name: "Roll Dice" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tie — reroll required"
    );
    expect(screen.getByRole("status")).toHaveTextContent("5 + 3 = 8");
    expect(screen.getByText(/G-1 \/ R-1/)).toBeInTheDocument();
  });

  it("polls every two seconds without overlap, pauses hidden/offline, resumes on lifecycle events, and stops decisively", async () => {
    vi.useFakeTimers();
    const openSnapshot = makeSnapshot();
    const completeSnapshot = makeSnapshot({
      activations: [
        {
          ...makeSnapshot().activations[0],
          games: [
            {
              gameNumber: 1,
              currentTieRound: 1,
              state: "complete",
              canRoll: false,
              winnerSlot: "player_one",
              rounds: [],
            },
            makeSnapshot().activations[0].games[1],
          ],
        },
      ],
    });
    const loadSnapshot = vi
      .fn<() => Promise<MatchDiceLoadResult>>()
      .mockResolvedValueOnce(success(openSnapshot))
      .mockResolvedValueOnce(success(openSnapshot))
      .mockResolvedValueOnce(success(openSnapshot))
      .mockResolvedValueOnce(success(openSnapshot))
      .mockResolvedValueOnce(success(completeSnapshot))
      .mockResolvedValue(success(openSnapshot));
    renderRollOff({ snapshot: null, loadSnapshot });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(3);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(3);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(4);

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
      await Promise.resolve();
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(5);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(6);
    expect(screen.getByRole("button", { name: "Roll Dice" })).toBeInTheDocument();
  });

  it("recovers an initially failed private read when connectivity returns", async () => {
    const loadSnapshot = vi
      .fn<() => Promise<MatchDiceLoadResult>>()
      .mockResolvedValueOnce({ ok: false, message: "Temporary read error." })
      .mockResolvedValue(success(makeSnapshot()));
    renderRollOff({ snapshot: null, loadSnapshot });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporary read error."
    );
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("tab", { name: /Game 1/i })).toBeInTheDocument();
  });

  it("follows a lawful reset to the new current activation and keeps polling", async () => {
    vi.useFakeTimers();
    const initialSnapshot = makeSnapshot();
    const archivedActivation = {
      ...initialSnapshot.activations[0],
      isCurrent: false,
    };
    const currentActivation = {
      ...initialSnapshot.activations[0],
      activationVersion: 4,
      isCurrent: true,
      games: initialSnapshot.activations[0].games.map((game) => ({
        ...game,
        state: "open" as const,
        canRoll: true,
        winnerSlot: null,
        rounds: [],
      })),
    };
    const resetSnapshot = makeSnapshot({
      currentActivationVersion: 4,
      activations: [archivedActivation, currentActivation],
    });
    const loadSnapshot = vi.fn(async () => success(resetSnapshot));

    renderRollOff({ snapshot: initialSnapshot, loadSnapshot });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByLabelText("Dice activation")).toHaveValue("4");
    expect(
      screen.getByText(
        translate(competitionEnglish, "dice.activationStatus", {
          version: 4,
          status: competitionEnglish.dice.current,
        }),
        { selector: "span" }
      )
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("backs off modestly after a polling error", async () => {
    vi.useFakeTimers();
    const loadSnapshot = vi
      .fn<() => Promise<MatchDiceLoadResult>>()
      .mockResolvedValueOnce(success(makeSnapshot()))
      .mockResolvedValueOnce({ ok: false, message: "Temporary read error." })
      .mockResolvedValue(success(makeSnapshot()));
    renderRollOff({ snapshot: null, loadSnapshot });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_999);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(3);
  });

  it("aborts an older read before the authoritative post-roll refresh", async () => {
    let firstReadSignal: AbortSignal | undefined;
    const rolledSnapshot = makeSnapshot({
      activations: [
        {
          ...makeSnapshot().activations[0],
          games: [
            {
              gameNumber: 1,
              currentTieRound: 1,
              state: "waiting",
              canRoll: false,
              winnerSlot: null,
              rounds: [
                {
                  tieRound: 1,
                  rolls: [
                    {
                      participantSlot: "player_one",
                      participantLabel: "Able Company",
                      die1: 5,
                      die2: 5,
                      total: 10,
                      rolledAt: "2026-08-17T02:00:00.000Z",
                    },
                  ],
                },
              ],
            },
            makeSnapshot().activations[0].games[1],
          ],
        },
      ],
    });
    const rollDice = vi.fn(async (): Promise<MatchDiceRollResult> => ({
      ok: true,
      data: {
        snapshot: rolledSnapshot,
        roll: {
          activationVersion: 3,
          gameNumber: 1,
          tieRound: 1,
          participantSlot: "player_one",
          die1: 5,
          die2: 5,
          total: 10,
          rolledAt: "2026-08-17T02:00:00.000Z",
          created: true,
        },
      },
    }));
    const loadSnapshot = vi
      .fn<
        (
          matchId: string,
          signal?: AbortSignal
        ) => Promise<MatchDiceLoadResult>
      >()
      .mockImplementationOnce(
        (_matchId, signal) =>
          new Promise<MatchDiceLoadResult>((resolve) => {
            firstReadSignal = signal;
            signal?.addEventListener(
              "abort",
              () => resolve(success(makeSnapshot())),
              { once: true }
            );
          })
      )
      .mockResolvedValue(success(rolledSnapshot));
    renderRollOff({ loadSnapshot, rollDice });

    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Roll Dice" }));
    expect(await screen.findByLabelText("First die: 5")).toHaveAttribute(
      "data-animating",
      "true"
    );
    expect(firstReadSignal?.aborted).toBe(true);
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Authoritative dice received. Rolling."
    );
  });

  it("aborts an in-flight private read when the workspace closes", async () => {
    let capturedSignal: AbortSignal | undefined;
    const loadSnapshot = vi.fn(
      (_matchId: string, signal?: AbortSignal) =>
        new Promise<MatchDiceLoadResult>((resolve) => {
          capturedSignal = signal;
          signal?.addEventListener(
            "abort",
            () =>
              resolve({
                ok: false,
                message: "Cancelled private history read.",
              }),
            { once: true }
          );
        })
    );
    const { unmount } = renderRollOff({ snapshot: null, loadSnapshot });

    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledOnce());
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("keeps terminal participant history read-only without labeling it as Admin", () => {
    const archived = {
      ...makeSnapshot().activations[0],
      activationVersion: 2,
      isCurrent: false,
    };
    const snapshot = makeSnapshot({
      viewerRole: "participant",
      viewerSlot: "player_one",
      isActionable: false,
      readOnlyReason: "tournament_not_in_progress",
      activations: [archived, makeSnapshot().activations[0]],
    });
    const { container } = renderRollOff({ snapshot, forceReadOnly: true });

    expect(screen.queryByRole("button", { name: "Roll Dice" })).not
      .toBeInTheDocument();
    expect(screen.getByText("Read-only Match history")).toBeInTheDocument();
    expect(screen.queryByText("Admin read-only inspection")).not
      .toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Tournament is not in progress. Dice history is read-only."
      )
    ).not.toHaveLength(0);
    expect(screen.getByLabelText("Dice activation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Game 3/i }));
    expect(
      screen.getByText(
        "Any stored roll-off applies only if the Series reaches Game 3."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/You may roll now or later/)).not
      .toBeInTheDocument();
    expect(container.textContent).not.toMatch(/registration|clerk|user_/i);
  });

  it("keeps an authorized Admin projection read-only, neutral, and live", async () => {
    vi.useFakeTimers();
    const baseSnapshot = makeSnapshot();
    const snapshot = makeSnapshot({
      viewerRole: "admin",
      viewerSlot: null,
      activations: [
        {
          ...baseSnapshot.activations[0],
          games: [
            {
              ...baseSnapshot.activations[0].games[0],
              state: "tied",
              canRoll: false,
            },
            baseSnapshot.activations[0].games[1],
          ],
        },
      ],
    });
    const loadSnapshot = vi.fn(async () => success(snapshot));
    renderRollOff({ snapshot, loadSnapshot, forceReadOnly: true });

    expect(screen.getAllByText("Admin read-only inspection")).not.toHaveLength(0);
    expect(
      screen.getByRole("tab", { name: /Game 3\s*Waiting/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Game 1\s*Tie$/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /reroll/i })).not
      .toBeInTheDocument();
    expect(screen.getByText("No roll recorded")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Your roll/i })).not
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll Dice" })).not
      .toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("does not label an Admin-participant open game as ready to roll", () => {
    const snapshot = makeSnapshot({
      viewerRole: "admin",
      viewerSlot: "player_one",
    });
    renderRollOff({ snapshot, forceReadOnly: true });

    expect(
      screen.getByRole("tab", { name: /Game 1\s*Open/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Ready/i })).not
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll Dice" })).not
      .toBeInTheDocument();
  });
});
