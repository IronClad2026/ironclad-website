// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PollsAndDecisions from "@/components/PollsAndDecisions";
import type { PollBallotActionResult } from "@/app/polls/actions";
import type { PollListSnapshot } from "@/lib/poll-loading";
import type { PollViewerProjection } from "@/lib/polls";

const mocks = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: "user_poll_a" as string | null,
    sessionId: "session_poll_a" as string | null,
  },
  fetch: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/app/polls/actions", () => ({ castPollBallot: vi.fn() }));

const TOURNAMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TOURNAMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POLL_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_POLL_ID = "22222222-2222-4222-8222-222222222222";
const OPTION_A = "33333333-3333-4333-8333-333333333333";
const OPTION_B = "44444444-4444-4444-8444-444444444444";
const ERROR_TEXT = "Polls could not be refreshed.";
const EMPTY_TEXT = "No private Polls or final published Decisions are available for this Tournament.";

beforeEach(() => {
  mocks.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: "user_poll_a",
    sessionId: "session_poll_a",
  };
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("authoritative Poll list recovery", () => {
  it("recovers an initially missing private list and keeps successful public decisions", async () => {
    const publicPoll = makePublicPoll();
    const initial = snapshot({
      public: { status: "loaded", polls: [publicPoll] },
      private: { status: "unavailable" },
    });
    mocks.fetch.mockResolvedValue(reply(snapshot({
      public: initial.public,
      private: { status: "loaded", polls: [makePoll()] },
    })));

    renderPoll(initial);
    expect(screen.getByText(ERROR_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: publicPoll.question })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();

    expect(await screen.findByRole("article", { name: "Private eligible question" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      `/api/polls?surface=tournament&tournamentId=${TOURNAMENT_ID}`,
      expect.objectContaining({ cache: "no-store", credentials: "same-origin", signal: expect.any(AbortSignal) })
    );
  });

  it("fetches an anonymous full public list rather than returning an empty local cache", async () => {
    setAnonymous();
    const initial = snapshot({ public: { status: "unavailable" } });
    mocks.fetch.mockResolvedValue(reply(snapshot({ public: { status: "loaded", polls: [makePublicPoll()] } })));
    renderPoll(initial);

    expect(await screen.findByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the warning through repeated failures and bounds automatic retry attempts", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue(new Response("{}", { status: 503 }));
    renderPoll(snapshot({ public: { status: "unavailable" }, private: { status: "unavailable" } }));

    for (const delay of [0, 14_000, 21_000, 120_000]) {
      await act(async () => vi.advanceTimersByTimeAsync(delay));
    }
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();

    mocks.fetch.mockResolvedValue(reply(snapshot()));
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
  });

  it("recovers independently validated public data during server authentication failure and clears private data", async () => {
    mocks.fetch.mockResolvedValue(reply(snapshot({
      public: { status: "loaded", polls: [makePublicPoll()] },
      private: { status: "unavailable" },
      accountState: "unavailable",
      viewerContext: { userId: null, sessionId: null },
    })));
    renderPoll(snapshot({
      public: { status: "unavailable" },
      private: { status: "loaded", polls: [makePoll()] },
    }));
    expect(await screen.findByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Private eligible question" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
  });

  it("does not call a skipped request successful or clear its warning", async () => {
    vi.useFakeTimers();
    const loadPolls = vi.fn().mockResolvedValue(undefined);
    render(
      <PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID}
        initialPolls={[]} initialError="Initial load failed" loadPolls={loadPolls} />
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it("replaces a previously populated source with a genuine authoritative empty success", async () => {
    mocks.fetch.mockResolvedValue(reply(snapshot()));
    renderPoll(snapshot({ private: { status: "loaded", polls: [makePoll()] } }));
    await focusWindow();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps prior public data when only the private source reloads successfully", async () => {
    const initial = snapshot({
      public: { status: "loaded", polls: [makePublicPoll()] },
      private: { status: "loaded", polls: [makePoll()] },
    });
    mocks.fetch.mockResolvedValue(reply(snapshot({
      public: { status: "unavailable" },
      private: { status: "loaded", polls: [makePoll({ question: "Fresh private question" })] },
    })));
    renderPoll(initial);
    await focusWindow();
    expect(screen.getByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Fresh private question" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
  });

  it("uses a fresh public final decision over a stale private copy when private reload fails", async () => {
    mocks.fetch.mockResolvedValue(reply(snapshot({
      public: { status: "loaded", polls: [makePublicPoll({ id: POLL_ID })] },
      private: { status: "unavailable" },
    })));
    renderPoll(snapshot({ private: { status: "loaded", polls: [makePoll()] } }));
    await focusWindow();
    expect(screen.getByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Private eligible question" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit vote" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
  });

  it.each(["missing", "closed"] as const)("treats verified %s account state as not applicable, without an error", async (accountState) => {
    mocks.fetch.mockResolvedValue(reply(snapshot({ accountState, private: { status: "not_applicable" } })));
    const { container } = renderPoll(snapshot({ private: { status: "unavailable" } }));
    await waitFor(() => expect(container.querySelector("[data-poll-account-state]"))
      .toHaveAttribute("data-poll-account-state", accountState));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(accountState === "missing"
      ? "Member polls are available after your player profile is set up."
      : "Member polls are not available for a closed account.");
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it.each(["wrong_account", "wrong_session", "wrong_tournament", "private_extra", "bad_http"])(
    "rejects a %s response without exposing its content or clearing the error", async (failure) => {
      const result = snapshot({ private: { status: "loaded", polls: [makePoll({ question: "Must remain hidden" })] } });
      if (failure === "wrong_account") result.viewerContext.userId = "user_other";
      if (failure === "wrong_session") result.viewerContext.sessionId = "session_other";
      if (failure === "wrong_tournament") result.tournamentId = OTHER_TOURNAMENT_ID;
      const payload = failure === "private_extra" ? { ...result, secret: "synthetic-private-value" } : result;
      mocks.fetch.mockResolvedValue(reply(payload, failure === "bad_http" ? 401 : 200));
      renderPoll(snapshot({ private: { status: "unavailable" } }));
      await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
      expect(screen.queryByText("Must remain hidden")).not.toBeInTheDocument();
      expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    }
  );

  it("preserves a dirty ballot draft while adopting the latest authoritative revision", async () => {
    mocks.fetch.mockResolvedValue(reply(snapshot({ private: { status: "loaded", polls: [makePoll({
      ballotRevision: 1,
      selectedOptionIds: [OPTION_A],
    })] } })));
    const castBallot = vi.fn().mockResolvedValue({ ok: false, code: "save_failed", error: "Synthetic refusal" });
    renderPoll(snapshot({ private: { status: "loaded", polls: [makePoll()] } }), { castBallot });
    fireEvent.click(screen.getByRole("radio", { name: "Option B" }));
    await focusWindow();
    expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Update vote" }));
    expect(castBallot).toHaveBeenCalledWith({ pollId: POLL_ID, expectedRevision: 1, selectedOptionIds: [OPTION_B] });
    await act(async () => Promise.resolve());
  });

  it("discards an old read after account switch and never seeds the new account from old server props", async () => {
    const oldRead = deferred<Response>();
    const oldSnapshot = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    mocks.fetch.mockReturnValueOnce(oldRead.promise);
    const view = renderPoll(oldSnapshot);
    await focusWindow();
    const oldSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;

    mocks.auth = { ...mocks.auth, userId: "user_poll_b", sessionId: "session_poll_b" };
    mocks.fetch.mockResolvedValue(reply(snapshot({ private: { status: "loaded", polls: [makePoll({ question: "New account question" })] } })));
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={oldSnapshot} />);
    expect(screen.queryByText("Private eligible question")).not.toBeInTheDocument();
    expect(oldSignal.aborted).toBe(true);
    expect(await screen.findByRole("article", { name: "New account question" })).toBeInTheDocument();

    await act(async () => oldRead.resolve(reply(oldSnapshot)));
    expect(screen.queryByText("Private eligible question")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "New account question" })).toBeInTheDocument();
  });

  it("removes private data immediately on sign-out while retaining the public source", async () => {
    const oldSnapshot = snapshot({
      public: { status: "loaded", polls: [makePublicPoll()] },
      private: { status: "loaded", polls: [makePoll()] },
    });
    const view = renderPoll(oldSnapshot);
    setAnonymous();
    mocks.fetch.mockResolvedValue(reply(snapshot({ public: oldSnapshot.public })));
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={oldSnapshot} />);
    expect(screen.queryByText("Private eligible question")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("does not display private SSR data before Clerk has resolved the current session", () => {
    const initial = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    mocks.auth = { ...mocks.auth, isLoaded: false };
    renderPoll(initial);
    expect(screen.queryByText("Private eligible question")).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "loaded"] as const)("drops private data on a different session while honoring the %s public outcome", async (publicStatus) => {
    const initial = snapshot({
      public: { status: "loaded", polls: [makePublicPoll()] },
      private: { status: "loaded", polls: [makePoll()] },
    });
    mocks.fetch.mockResolvedValue(reply(snapshot({
      viewerContext: { userId: "user_poll_a", sessionId: "session_replaced" },
      public: publicStatus === "loaded" ? { status: "loaded", polls: [] } : { status: "unavailable" },
    })));
    renderPoll(initial);
    await focusWindow();
    expect(screen.queryByRole("article", { name: "Private eligible question" })).not.toBeInTheDocument();
    if (publicStatus === "unavailable") {
      expect(screen.getByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("article", { name: "Public final decision" })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
  });

  it("isolates tournament changes and refuses a previous tournament's late result", async () => {
    const oldRead = deferred<Response>();
    const initial = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    mocks.fetch.mockReturnValueOnce(oldRead.promise);
    const view = renderPoll(initial);
    await focusWindow();
    const next = snapshot({ tournamentId: OTHER_TOURNAMENT_ID, private: { status: "unavailable" } });
    mocks.fetch.mockResolvedValue(reply(snapshot({
      tournamentId: OTHER_TOURNAMENT_ID,
      private: { status: "loaded", polls: [makePoll({ tournamentId: OTHER_TOURNAMENT_ID, question: "Other tournament question" })] },
    })));
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={OTHER_TOURNAMENT_ID} initialPolls={[]} initialSnapshot={next} />);
    expect(await screen.findByRole("article", { name: "Other tournament question" })).toBeInTheDocument();
    await act(async () => oldRead.resolve(reply(initial)));
    expect(screen.queryByText("Private eligible question")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenLastCalledWith(`/api/polls?surface=tournament&tournamentId=${OTHER_TOURNAMENT_ID}`, expect.anything());
  });

  it("does not apply a cancelled read after the page becomes hidden", async () => {
    const read = deferred<Response>();
    mocks.fetch.mockReturnValue(read.promise);
    renderPoll(snapshot({ private: { status: "loaded", polls: [makePoll()] } }));
    await focusWindow();
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(signal.aborted).toBe(true);
    await act(async () => read.resolve(reply(snapshot())));
    expect(screen.getByRole("article", { name: "Private eligible question" })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it("revalidates changed server props without discarding the same-session dirty draft", async () => {
    const initial = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    const view = renderPoll(initial);
    fireEvent.click(screen.getByRole("radio", { name: "Option B" }));
    const updated = snapshot({ private: { status: "loaded", polls: [makePoll({ ballotRevision: 1, selectedOptionIds: [OPTION_A] })] } });
    mocks.fetch.mockResolvedValue(reply(updated));
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={updated} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Update vote" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not apply stale server props during or after a ballot mutation", async () => {
    const vote = deferred<PollBallotActionResult>();
    const freshRead = deferred<Response>();
    const castBallot = vi.fn(() => vote.promise);
    const initial = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    const view = renderPoll(initial, { castBallot });
    fireEvent.click(screen.getByRole("radio", { name: "Option B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));

    const stale = snapshot({ private: { status: "loaded", polls: [makePoll({ question: "Stale SSR question" })] } });
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={stale} castBallot={castBallot} />);
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(screen.queryByText("Stale SSR question")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
    expect(mocks.fetch).not.toHaveBeenCalled();

    mocks.fetch.mockReturnValueOnce(freshRead.promise).mockResolvedValue(new Response("{}", { status: 503 }));
    await act(async () => vote.resolve(savedBallot()));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={{ ...stale }} castBallot={castBallot} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await act(async () => freshRead.resolve(reply(stale)));
    expect(screen.queryByText("Stale SSR question")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Update vote" })).toBeDisabled();
  });

  it("retains public decisions while explaining a verified closed account", async () => {
    const initial = snapshot({ public: { status: "loaded", polls: [makePublicPoll()] }, private: { status: "unavailable" } });
    mocks.fetch.mockResolvedValue(reply(snapshot({
      public: initial.public, accountState: "closed", private: { status: "not_applicable" },
    })));
    renderPoll(initial);
    expect(await screen.findByText("Member polls are not available for a closed account.")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Public final decision" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("bounds a hanging transport with a timeout and never calls it an empty success", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation((_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    renderPoll(snapshot({ private: { status: "unavailable" } }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_TEXT);
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps paired desktop/mobile consumers to one active request and deduplicates wake events", async () => {
    vi.useFakeTimers();
    let desktop = true;
    const listeners = new Set<() => void>();
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
      get matches() { return desktop; },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    })) });
    const read = deferred<Response>();
    mocks.fetch.mockReturnValue(read.promise);
    const initial = snapshot({ private: { status: "unavailable" } });
    try {
      render(<>
        <PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={initial} presentation="desktop" />
        <PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={initial} presentation="mobile" />
      </>);
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event("online"));
        window.dispatchEvent(new Event("pageshow"));
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const firstSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
      desktop = false;
      await act(async () => { for (const listener of listeners) listener(); });
      expect(firstSignal.aborted).toBe(true);
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      await act(async () => read.resolve(reply(snapshot())));
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
    }
  });

  it("ignores an old account's ballot completion after sign-out", async () => {
    const vote = deferred<PollBallotActionResult>();
    const castBallot = vi.fn(() => vote.promise);
    const oldSnapshot = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    const view = renderPoll(oldSnapshot, { castBallot });
    fireEvent.click(screen.getByRole("radio", { name: "Option B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));
    setAnonymous();
    mocks.fetch.mockResolvedValue(reply(snapshot()));
    view.rerender(<PollsAndDecisions surface="tournament" tournamentId={TOURNAMENT_ID} initialPolls={[]} initialSnapshot={oldSnapshot} castBallot={castBallot} />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    await act(async () => vote.resolve(savedBallot()));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your ballot is saved/)).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not let a pre-vote read overwrite the saved ballot", async () => {
    const oldRead = deferred<Response>();
    const oldSnapshot = snapshot({ private: { status: "loaded", polls: [makePoll()] } });
    mocks.fetch.mockReturnValueOnce(oldRead.promise).mockResolvedValue(reply(snapshot({
      private: { status: "loaded", polls: [makePoll({ ballotRevision: 1, selectedOptionIds: [OPTION_B] })] },
    })));
    renderPoll(oldSnapshot, { castBallot: vi.fn().mockResolvedValue(savedBallot()) });
    await focusWindow();
    fireEvent.click(screen.getByRole("radio", { name: "Option B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await act(async () => oldRead.resolve(reply(oldSnapshot)));
    expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Update vote" })).toBeDisabled();
  });

  it("recovers Community Polls with the shared full-list path and preserves cancellation", async () => {
    const community = makePoll({
      purpose: "community_feedback", audienceKind: "active_players", tournamentId: null, authority: "advisory",
    });
    const initial = snapshot({ surface: "community", tournamentId: null, public: { status: "not_applicable" }, private: { status: "unavailable" } });
    mocks.fetch.mockResolvedValueOnce(reply({ ...initial, private: { status: "loaded", polls: [community] } }))
      .mockResolvedValue(reply({ ...initial, private: { status: "loaded", polls: [{
        ...community, status: "cancelled", cancelledAt: "2026-09-08T03:00:00.000Z", cancellationReason: "Synthetic cancellation",
      }] } }));
    renderPoll(initial);
    expect(await screen.findByRole("article", { name: community.question })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "/api/polls?surface=community", expect.anything());
    await focusWindow();
    const card = screen.getByRole("article", { name: community.question });
    expect(within(card).getByText("Synthetic cancellation")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Submit vote" })).not.toBeInTheDocument();
  });
});

function renderPoll(initialSnapshot: PollListSnapshot, props: Partial<ComponentProps<typeof PollsAndDecisions>> = {}) {
  return render(<PollsAndDecisions surface={initialSnapshot.surface}
    tournamentId={initialSnapshot.tournamentId ?? undefined} initialPolls={[]} initialSnapshot={initialSnapshot} {...props} />);
}

function snapshot(overrides: Partial<PollListSnapshot> = {}): PollListSnapshot {
  return {
    surface: "tournament", tournamentId: TOURNAMENT_ID,
    public: { status: "loaded", polls: [] },
    private: mocks.auth.isSignedIn ? { status: "loaded", polls: [] } : { status: "not_applicable" },
    accountState: mocks.auth.isSignedIn ? "active" : "anonymous",
    viewerContext: { userId: mocks.auth.userId, sessionId: mocks.auth.sessionId },
    ...overrides,
  };
}

function makePoll(overrides: Partial<PollViewerProjection> = {}): PollViewerProjection {
  return {
    id: POLL_ID, purpose: "tournament_decision", audienceKind: "tournament_approved",
    tournamentId: TOURNAMENT_ID, tournamentBracketId: null, question: "Private eligible question",
    context: null, optionSource: "text", maxSelections: 1, winnerCount: 1,
    authority: "binding", resultVisibility: "after_close", publicFinalTotals: false,
    opensAt: "2026-09-08T00:00:00.000Z", closesAt: "2099-09-09T00:00:00.000Z",
    publishedAt: "2026-09-07T00:00:00.000Z", cancelledAt: null, cancellationReason: null,
    finalDecisionPublishedAt: null, finalDecisionBasis: null, finalRationale: null,
    bindingTieRuleUsed: false, status: "open", ballotRevision: 0, selectedOptionIds: [],
    options: [OPTION_A, OPTION_B].map((id, index) => ({
      id, position: index + 1, label: index === 0 ? "Option A" : "Option B", map: null,
      pollResultRank: null, finalDecisionRank: null,
    })),
    ...overrides,
  };
}

function makePublicPoll(overrides: Partial<PollViewerProjection> = {}): PollViewerProjection {
  const poll = makePoll({
    id: PUBLIC_POLL_ID, question: "Public final decision", status: "final_decision_published",
    closesAt: "2026-09-08T01:00:00.000Z", finalDecisionPublishedAt: "2026-09-08T02:00:00.000Z",
    finalDecisionBasis: "binding_computed", ...overrides,
  });
  delete poll.ballotRevision;
  delete poll.selectedOptionIds;
  poll.options = poll.options.map((option, index) => ({
    ...option, pollResultRank: index === 0 ? 1 : null, finalDecisionRank: index === 0 ? 1 : null,
  }));
  return poll;
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setAnonymous() {
  mocks.auth = { isLoaded: true, isSignedIn: false, userId: null, sessionId: null };
}

async function focusWindow() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function savedBallot(): PollBallotActionResult {
  return {
    ok: true,
    data: {
      pollId: POLL_ID, ballotRevision: 1, selectedOptionIds: [OPTION_B],
      firstVotedAt: "2026-09-08T03:00:00.000Z", ballotUpdatedAt: "2026-09-08T03:00:00.000Z", idempotent: false,
    },
  };
}
