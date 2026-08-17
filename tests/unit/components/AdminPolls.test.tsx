// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminPolls, { type AdminPollView } from "@/components/AdminPolls";

const loadAdminPollSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/admin/polls/actions", () => ({
  cancelPoll: vi.fn(),
  deletePollDraft: vi.fn(),
  loadAdminPollSnapshot: loadAdminPollSnapshotMock,
  previewPollEligibility: vi.fn(),
  publishPoll: vi.fn(),
  publishPollFinalDecision: vi.fn(),
  savePollDraft: vi.fn(),
}));

const tournamentId = "123e4567-e89b-42d3-a456-426614174000";
const bracketId = "133e4567-e89b-42d3-a456-426614174000";

describe("AdminPolls", () => {
  afterEach(() => {
    cleanup();
    loadAdminPollSnapshotMock.mockReset();
    vi.useRealTimers();
  });

  it("renders the locked draft configuration and keyboard option ordering", () => {
    render(
      <AdminPolls
        polls={[]}
        tournaments={[
          {
            id: tournamentId,
            title: "Synthetic Cup",
            status: "registration_open",
            brackets: [],
            approvedPlayers: [],
          },
        ]}
        activePlayers={[]}
        activeMaps={[]}
      />
    );

    expect(screen.getByRole("heading", { name: "Polls & Decisions" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Purpose"), {
      target: { value: "community_feedback" },
    });
    expect(screen.getByText("Active IronClad players")).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveAttribute("maxlength", "160");
    expect(screen.getByLabelText("Context or description")).toHaveAttribute(
      "maxlength",
      "1000"
    );
    expect(screen.getByLabelText("Maximum selections")).toHaveAttribute(
      "max",
      "5"
    );
    expect(screen.getByLabelText("Winner count")).toHaveAttribute("max", "5");

    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    const optionGroup = screen.getByRole("group", { name: "Answer options" });
    expect(within(optionGroup).getAllByLabelText(/Option \d label/)).toHaveLength(3);
    expect(within(optionGroup).getAllByRole("button", { name: /Move option .* up/ }))
      .toHaveLength(3);
    expect(within(optionGroup).getAllByRole("button", { name: /Move option .* down/ }))
      .toHaveLength(3);
  });

  it("requires a confirmation dialog that discloses Binding turnout and immutability", () => {
    render(
      <AdminPolls
        polls={[
          {
            id: "223e4567-e89b-42d3-a456-426614174000",
            purpose: "tournament_decision",
            audienceKind: "tournament_division_approved",
            tournamentId,
            tournamentBracketId: bracketId,
            question: "Which maps should form the pool?",
            context: null,
            optionSource: "text",
            maxSelections: 2,
            winnerCount: 2,
            authority: "binding",
            resultVisibility: "after_close",
            publicFinalTotals: false,
            opensAt: "2026-08-18T10:00:00.000Z",
            closesAt: "2026-08-19T10:00:00.000Z",
            publishedAt: null,
            cancelledAt: null,
            cancellationReason: null,
            finalDecisionPublishedAt: null,
            finalDecisionBasis: null,
            finalRationale: null,
            bindingTieRuleUsed: false,
            frozenEligibleCount: 12,
            submittedBallotCount: 0,
            options: [
              { id: optionIds[0], position: 1, label: "Road to Tunis", mapId: null, mapNameSnapshot: null, mapSlugSnapshot: null, total: null, finalDecisionRank: null },
              { id: optionIds[1], position: 2, label: "Faymonville", mapId: null, mapNameSnapshot: null, mapSlugSnapshot: null, total: null, finalDecisionRank: null },
            ],
          },
        ]}
        selectedPollId="223e4567-e89b-42d3-a456-426614174000"
        eligibleCountResult={12}
        tournaments={[
          {
            id: tournamentId,
            title: "Synthetic Cup",
            status: "registration_open",
            brackets: [
              {
                id: bracketId,
                name: "Academy Division",
                currentMapIds: [],
              },
            ],
            approvedPlayers: [],
          },
        ]}
        activePlayers={[]}
        activeMaps={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Review publication" }));
    const dialog = screen.getByRole("dialog", { name: "Publish poll" });
    expect(
      within(dialog).getByText(/Current\/revalidated eligibility preview/i)
    )
      .toBeInTheDocument();
    expect(within(dialog).getByText(/12 players/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/final authoritative frozen count is returned/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Synthetic Cup")).toBeInTheDocument();
    expect(within(dialog).getByText("Academy Division")).toBeInTheDocument();
    expect(within(dialog).getByText(/regardless of turnout once at least one valid ballot/i))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be edited, reopened, or rescheduled/i))
      .toBeInTheDocument();
  });

  it("lets Draft deletion bypass unrelated editor constraints", () => {
    renderAdminPoll(
      pollFixture({
        publishedAt: null,
        question: "",
        options: [
          pollOption(optionIds[0], 1, "", null),
          pollOption(optionIds[1], 2, "", null),
        ],
      })
    );

    expect(screen.getByRole("button", { name: "Delete Draft" })).toHaveAttribute(
      "formnovalidate"
    );
  });

  it("blocks publication when account closure invalidated a selected Draft audience", () => {
    const draft = pollFixture({
      publishedAt: null,
      audienceKind: "selected_tournament_players",
      selectedPlayerIds: ["723e4567-e89b-42d3-a456-426614174000"],
      draftAudienceInvalidated: true,
    });
    renderAdminPoll(draft);

    expect(
      screen.getByText(/closed their account after this Draft was saved/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Save Audience Before Publication",
      })
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Review publication" })
    ).not.toBeInTheDocument();
  });

  it("limits a Binding cutoff tie to the database-computed tie group", () => {
    const closed = pollFixture({
      maxSelections: 2,
      winnerCount: 2,
      authority: "binding",
      submittedBallotCount: 8,
      computedWinnerOptionIds: [optionIds[0]],
      cutoffTieOptionIds: [optionIds[1], optionIds[2]],
      cutoffSlotsRemaining: 1,
      options: [
        pollOption(optionIds[0], 1, "Road to Tunis", 8),
        pollOption(optionIds[1], 2, "Faymonville", 5),
        pollOption(optionIds[2], 3, "Twin Beaches", 5),
        pollOption(optionIds[3], 4, "Taranto Coastline", 2),
      ],
    });
    renderAdminPoll(closed);

    fireEvent.click(
      screen.getByRole("button", { name: "Publish Final Decision" })
    );
    const dialog = screen.getByRole("dialog", {
      name: "Publish final decision",
    });
    expect(within(dialog).getByLabelText(/^Road to Tunis/)).toBeDisabled();
    expect(within(dialog).getByLabelText(/^Road to Tunis/)).toBeChecked();
    expect(within(dialog).getByLabelText(/^Faymonville/)).toBeEnabled();
    expect(within(dialog).getByLabelText(/^Twin Beaches/)).toBeEnabled();
    expect(within(dialog).getByLabelText(/^Taranto Coastline/)).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Publish Final Decision" })
    ).toBeDisabled();

    fireEvent.click(within(dialog).getByLabelText(/^Faymonville/));
    expect(
      within(dialog).getByRole("button", { name: "Publish Final Decision" })
    ).toBeEnabled();
  });

  it("requires rationale when an Advisory selection differs from the deterministic top set", () => {
    const closed = pollFixture({
      maxSelections: 2,
      winnerCount: 2,
      authority: "advisory",
      submittedBallotCount: 8,
      computedWinnerOptionIds: [optionIds[0], optionIds[1]],
      cutoffTieOptionIds: [optionIds[1], optionIds[2]],
      cutoffSlotsRemaining: 1,
      options: [
        pollOption(optionIds[0], 1, "Road to Tunis", 8),
        pollOption(optionIds[1], 2, "Faymonville", 5),
        pollOption(optionIds[2], 3, "Twin Beaches", 5),
        pollOption(optionIds[3], 4, "Taranto Coastline", 2),
      ],
    });
    renderAdminPoll(closed);
    fireEvent.click(
      screen.getByRole("button", { name: "Publish Final Decision" })
    );
    const dialog = screen.getByRole("dialog", {
      name: "Publish final decision",
    });
    const rationale = within(dialog).getByLabelText(/Final rationale/);
    expect(rationale).not.toBeRequired();

    fireEvent.click(within(dialog).getByLabelText(/^Faymonville/));
    fireEvent.click(within(dialog).getByLabelText(/^Twin Beaches/));
    expect(rationale).toBeRequired();
  });

  it("shows turnout but no option totals for an open hidden-results poll", () => {
    const now = Date.now();
    const open = pollFixture({
      opensAt: new Date(now - 60_000).toISOString(),
      closesAt: new Date(now + 60_000).toISOString(),
      submittedBallotCount: 4,
      resultVisibility: "after_close",
      options: [
        pollOption(optionIds[0], 1, "Road to Tunis", null),
        pollOption(optionIds[1], 2, "Faymonville", null),
      ],
    });
    renderAdminPoll(open);

    const turnout = screen.getByText("Submitted ballots").closest("div");
    expect(turnout).not.toBeNull();
    expect(within(turnout as HTMLElement).getByText("4")).toBeInTheDocument();
    expect(
      screen.getByText(/Per-option totals are hidden from Admin/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/4 ballots/)).not.toBeInTheDocument();
  });

  it("requires cancellation for a zero-ballot Binding result", () => {
    renderAdminPoll(pollFixture({ submittedBallotCount: 0 }));

    expect(
      screen.getByRole("button", { name: "Publish Final Decision" })
    ).toBeDisabled();
    expect(screen.getByText(/zero-ballot Binding poll is invalid/i))
      .toBeInTheDocument();
  });

  it("refreshes only an open live-results Admin poll after seven seconds", async () => {
    vi.useFakeTimers();
    loadAdminPollSnapshotMock.mockResolvedValue({ ok: false });
    const live = pollFixture({
      status: "open",
      resultVisibility: "live",
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });
    renderAdminPoll(live);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_999);
    });
    expect(loadAdminPollSnapshotMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadAdminPollSnapshotMock).toHaveBeenCalledExactlyOnceWith(live.id);
  });

  it("does not request option aggregates for an open hidden-results poll", async () => {
    vi.useFakeTimers();
    const hidden = pollFixture({
      status: "open",
      resultVisibility: "after_close",
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });
    renderAdminPoll(hidden);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });
    expect(loadAdminPollSnapshotMock).not.toHaveBeenCalled();
  });

  it("refreshes a scheduled poll at its database opening boundary", async () => {
    vi.useFakeTimers();
    loadAdminPollSnapshotMock.mockResolvedValue({ ok: false });
    const scheduled = pollFixture({
      status: "scheduled",
      resultVisibility: "after_close",
      opensAt: new Date(Date.now() + 5_000).toISOString(),
      closesAt: new Date(Date.now() + 65_000).toISOString(),
    });
    renderAdminPoll(scheduled);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_249);
    });
    expect(loadAdminPollSnapshotMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadAdminPollSnapshotMock).toHaveBeenCalledExactlyOnceWith(
      scheduled.id
    );
  });

  it("refreshes an open hidden-results poll at its database close boundary", async () => {
    vi.useFakeTimers();
    loadAdminPollSnapshotMock.mockResolvedValue({ ok: false });
    const hidden = pollFixture({
      status: "open",
      resultVisibility: "after_close",
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 5_000).toISOString(),
    });
    renderAdminPoll(hidden);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_249);
    });
    expect(loadAdminPollSnapshotMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadAdminPollSnapshotMock).toHaveBeenCalledExactlyOnceWith(hidden.id);
  });

  it("re-arms the browser timer limit without polling a distant scheduled poll", async () => {
    vi.useFakeTimers();
    loadAdminPollSnapshotMock.mockResolvedValue({ ok: false });
    const browserTimerMaximum = 2_147_000_000;
    const scheduled = pollFixture({
      status: "scheduled",
      resultVisibility: "after_close",
      opensAt: new Date(Date.now() + browserTimerMaximum + 5_000).toISOString(),
      closesAt: new Date(Date.now() + browserTimerMaximum + 65_000).toISOString(),
    });
    renderAdminPoll(scheduled);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(browserTimerMaximum);
    });
    expect(loadAdminPollSnapshotMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_249);
    });
    expect(loadAdminPollSnapshotMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadAdminPollSnapshotMock).toHaveBeenCalledExactlyOnceWith(
      scheduled.id
    );
  });
});

const optionIds = [
  "323e4567-e89b-42d3-a456-426614174000",
  "423e4567-e89b-42d3-a456-426614174000",
  "523e4567-e89b-42d3-a456-426614174000",
  "623e4567-e89b-42d3-a456-426614174000",
];

function pollOption(
  id: string,
  position: number,
  label: string,
  voteCount: number | null
): AdminPollView["options"][number] {
  return {
    id,
    position,
    label,
    mapId: null,
    mapNameSnapshot: null,
    mapSlugSnapshot: null,
    voteCount,
    finalDecisionRank: null,
  };
}

function pollFixture(overrides: Partial<AdminPollView> = {}): AdminPollView {
  const now = Date.now();
  return {
    id: "223e4567-e89b-42d3-a456-426614174000",
    purpose: "tournament_decision",
    audienceKind: "tournament_approved",
    tournamentId,
    tournamentBracketId: null,
    question: "Which maps should form the pool?",
    context: null,
    optionSource: "text",
    maxSelections: 1,
    winnerCount: 1,
    authority: "binding",
    resultVisibility: "after_close",
    publicFinalTotals: false,
    opensAt: new Date(now - 120_000).toISOString(),
    closesAt: new Date(now - 60_000).toISOString(),
    publishedAt: new Date(now - 180_000).toISOString(),
    cancelledAt: null,
    cancellationReason: null,
    finalDecisionPublishedAt: null,
    finalDecisionBasis: null,
    finalRationale: null,
    bindingTieRuleUsed: false,
    frozenEligibleCount: 12,
    submittedBallotCount: 1,
    computedWinnerOptionIds: [optionIds[0]],
    cutoffTieOptionIds: [],
    cutoffSlotsRemaining: 0,
    options: [
      pollOption(optionIds[0], 1, "Road to Tunis", 1),
      pollOption(optionIds[1], 2, "Faymonville", 0),
    ],
    ...overrides,
  };
}

function renderAdminPoll(poll: AdminPollView) {
  return render(
    <AdminPolls
      polls={[poll]}
      selectedPollId={poll.id}
      tournaments={[]}
      activePlayers={[]}
      activeMaps={[]}
    />
  );
}
