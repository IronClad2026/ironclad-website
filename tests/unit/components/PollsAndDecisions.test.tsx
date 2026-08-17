// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PollsAndDecisions from "@/components/PollsAndDecisions";
import type {
  PollOptionProjection,
  PollViewerProjection,
} from "@/lib/polls";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn(), isSignedIn: true }),
}));

const POLL_ID = "11111111-1111-4111-8111-111111111111";
const OPTION_A_ID = "22222222-2222-4222-8222-222222222222";
const OPTION_B_ID = "33333333-3333-4333-8333-333333333333";
const OPTION_C_ID = "44444444-4444-4444-8444-444444444444";

afterEach(() => {
  cleanup();
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

describe("PollsAndDecisions", () => {
  it("submits one authenticated single-choice ballot using the current revision", async () => {
    const castBallot = vi.fn(async () => ({
      ok: true as const,
      data: {
        pollId: POLL_ID,
        ballotRevision: 1,
        selectedOptionIds: [OPTION_B_ID],
        firstVotedAt: "2026-08-18T01:00:00.000Z",
        ballotUpdatedAt: "2026-08-18T01:00:00.000Z",
        idempotent: false,
      },
    }));

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[makePoll()]}
        castBallot={castBallot}
        loadPolls={vi.fn()}
      />
    );

    const poll = screen.getByRole("article", { name: "Choose our opening map" });
    expect(within(poll).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(within(poll).getByRole("radio", { name: "Road to Tunis" }));
    fireEvent.click(within(poll).getByRole("button", { name: "Submit vote" }));

    expect(castBallot).toHaveBeenCalledWith({
      pollId: POLL_ID,
      expectedRevision: 0,
      selectedOptionIds: [OPTION_B_ID],
    });
    expect(await within(poll).findByRole("status")).toHaveTextContent(
      "Your ballot is saved"
    );
  });

  it("uses native checkboxes and enforces the published choose-up-to limit", () => {
    const poll = makePoll({ maxSelections: 2, winnerCount: 2 });
    render(
      <PollsAndDecisions
        surface="community"
        initialPolls={[poll]}
        castBallot={vi.fn()}
        loadPolls={vi.fn()}
      />
    );

    const card = screen.getByRole("article", { name: poll.question });
    const checkboxes = within(card).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(within(card).getByText("2 selected / maximum 2")).toBeInTheDocument();
    expect(checkboxes[2]).toBeDisabled();
  });

  it("does not render hidden aggregate or private identity fields while open", () => {
    const { container } = render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[makePoll({ resultVisibility: "after_close" })]}
        castBallot={vi.fn()}
        loadPolls={vi.fn()}
      />
    );

    expect(screen.getByText("Results available after close")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /\d+\s+votes|\d+(?:\.\d+)?%|player_id|clerk|eligible_voter/i
    );
    expect(container.innerHTML).not.toContain("55555555-5555-4555-8555-555555555555");
  });

  it("shows ranked multi-winner final decisions and advisory distinction", () => {
    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[
          makePoll({
            status: "final_decision_published",
            authority: "advisory",
            selectedOptionIds: [],
            ballotRevision: undefined,
            finalDecisionPublishedAt: "2026-08-18T03:00:00.000Z",
            finalDecisionBasis: "advisory_admin_override",
            finalRationale: "Operational variety for the final pool.",
            options: [
              makeOption(OPTION_A_ID, "Faymonville", 1, 8, null),
              makeOption(OPTION_B_ID, "Road to Tunis", 2, 7, 1),
              makeOption(OPTION_C_ID, "Twin Beaches", 3, 6, 2),
            ],
          }),
        ]}
        castBallot={vi.fn()}
        loadPolls={vi.fn()}
      />
    );

    expect(screen.getByText("Poll result")).toBeInTheDocument();
    expect(screen.getByText("Admin final decision")).toBeInTheDocument();
    expect(screen.getByText("1. Road to Tunis")).toBeInTheDocument();
    expect(screen.getByText("2. Twin Beaches")).toBeInTheDocument();
    expect(screen.getByText("Operational variety for the final pool.")).toBeInTheDocument();
  });

  it("refreshes live results every seven seconds without overlap and pauses hidden/offline", async () => {
    vi.useFakeTimers();
    let releaseRead: (() => void) | undefined;
    const loadPolls = vi.fn(
      () =>
        new Promise<{ ok: true; polls: ReturnType<typeof makePoll>[] }>((resolve) => {
          releaseRead = () => resolve({ ok: true, polls: [makePoll()] });
        })
    );

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[makePoll()]}
        castBallot={vi.fn()}
        loadPolls={loadPolls}
        pollIntervalMs={7_000}
      />
    );

    await act(async () => vi.advanceTimersByTimeAsync(6_999));
    expect(loadPolls).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(14_000));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => releaseRead?.());

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(loadPolls).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(loadPolls).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(loadPolls).toHaveBeenCalledTimes(2);
    await act(async () => releaseRead?.());
  });

  it("uses a modest interval backoff after a failed live refresh", async () => {
    vi.useFakeTimers();
    const loadPolls = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Temporary Poll read error." })
      .mockResolvedValue({ ok: true, polls: [makePoll()] });

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[makePoll()]}
        castBallot={vi.fn()}
        loadPolls={loadPolls}
        pollIntervalMs={7_000}
      />
    );

    await act(async () => vi.advanceTimersByTimeAsync(7_000));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(13_999));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(loadPolls).toHaveBeenCalledTimes(2);
  });

  it("performs one authoritative close-boundary refresh for a hidden poll", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T01:00:00.000Z"));
    const loadPolls = vi.fn(async () => ({
      ok: true as const,
      polls: [makePoll({ status: "closed" })],
    }));

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[
          makePoll({
            resultVisibility: "after_close",
            closesAt: "2026-08-18T01:00:10.000Z",
          }),
        ]}
        castBallot={vi.fn()}
        loadPolls={loadPolls}
        pollIntervalMs={7_000}
      />
    );

    await act(async () => vi.advanceTimersByTimeAsync(9_999));
    expect(loadPolls).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(loadPolls).toHaveBeenCalledTimes(1);
  });

  it("retries a failed hidden-result boundary refresh with modest backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T01:00:00.000Z"));
    const loadPolls = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        message: "Temporary Poll read error.",
      })
      .mockResolvedValue({
        ok: true,
        polls: [makePoll({ status: "closed" })],
      });

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[
          makePoll({
            resultVisibility: "after_close",
            closesAt: "2026-08-18T01:00:10.000Z",
          }),
        ]}
        castBallot={vi.fn()}
        loadPolls={loadPolls}
        pollIntervalMs={7_000}
      />
    );

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(13_999));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(loadPolls).toHaveBeenCalledTimes(2);
  });

  it("makes no boundary request while offline and refreshes when connectivity returns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T01:00:00.000Z"));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const loadPolls = vi.fn(async () => ({
      ok: true as const,
      polls: [makePoll({ status: "closed" })],
    }));

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[
          makePoll({
            resultVisibility: "after_close",
            closesAt: "2026-08-18T01:00:10.000Z",
          }),
        ]}
        castBallot={vi.fn()}
        loadPolls={loadPolls}
      />
    );

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(loadPolls).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(loadPolls).toHaveBeenCalledTimes(1);
  });

  it("keeps a scheduled boundary refresh alive beyond the browser timer limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T01:00:00.000Z"));
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1_000;
    const opensAt = new Date(Date.now() + thirtyDaysMs).toISOString();
    const scheduledPoll = makePoll({ status: "scheduled", opensAt });
    const loadPolls = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, polls: [scheduledPoll] })
      .mockResolvedValue({
        ok: true,
        polls: [makePoll({ status: "open", opensAt })],
      });

    render(
      <PollsAndDecisions
        surface="tournament"
        initialPolls={[scheduledPoll]}
        castBallot={vi.fn()}
        loadPolls={loadPolls}
      />
    );

    await act(async () => vi.advanceTimersByTimeAsync(2_147_000_000));
    expect(loadPolls).toHaveBeenCalledTimes(1);

    const remainingDelay = thirtyDaysMs - 2_147_000_000;
    await act(async () => vi.advanceTimersByTimeAsync(remainingDelay - 1));
    expect(loadPolls).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(loadPolls).toHaveBeenCalledTimes(2);
  });

  it("refreshes once when an inactive responsive instance becomes visible", async () => {
    let desktop = true;
    const listeners = new Set<() => void>();
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        get matches() {
          return desktop;
        },
        media: "(min-width: 1024px)",
        onchange: null,
        addEventListener: (_event: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          listeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const loadPolls = vi.fn(async () => ({
      ok: true as const,
      polls: [makePoll({ ballotRevision: 2, selectedOptionIds: [OPTION_B_ID] })],
    }));

    try {
      render(
        <PollsAndDecisions
          surface="tournament"
          presentation="mobile"
          initialPolls={[makePoll()]}
          castBallot={vi.fn()}
          loadPolls={loadPolls}
        />
      );

      expect(loadPolls).not.toHaveBeenCalled();
      desktop = false;
      await act(async () => {
        for (const listener of listeners) listener();
        await Promise.resolve();
      });
      expect(loadPolls).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("radio", { name: "Road to Tunis" })).toBeChecked();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});

function makePoll(
  overrides: Partial<PollViewerProjection> = {}
): PollViewerProjection {
  return {
    id: POLL_ID,
    purpose: "tournament_decision",
    audienceKind: "tournament_approved",
    tournamentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tournamentBracketId: null,
    question: "Choose our opening map",
    context: "Select the map you prefer for the opening round.",
    optionSource: "text",
    maxSelections: 1,
    winnerCount: 1,
    authority: "binding",
    resultVisibility: "live",
    publicFinalTotals: false,
    opensAt: "2026-08-18T00:00:00.000Z",
    closesAt: "2099-08-25T00:00:00.000Z",
    publishedAt: "2026-08-17T00:00:00.000Z",
    cancelledAt: null,
    cancellationReason: null,
    finalDecisionPublishedAt: null,
    finalDecisionBasis: null,
    finalRationale: null,
    bindingTieRuleUsed: false,
    status: "open",
    ballotRevision: 0,
    selectedOptionIds: [],
    options: [
      makeOption(OPTION_A_ID, "Faymonville", 1),
      makeOption(OPTION_B_ID, "Road to Tunis", 2),
      makeOption(OPTION_C_ID, "Twin Beaches", 3),
    ],
    ...overrides,
  };
}

function makeOption(
  id: string,
  label: string,
  position: number,
  voteCount: number = 0,
  finalDecisionRank: number | null = null,
  pollResultRank: number | null = null
): PollOptionProjection {
  return {
    id,
    position,
    label,
    map: null,
    voteCount,
    selectionSharePercent: voteCount * 10,
    pollResultRank,
    finalDecisionRank,
  };
}
