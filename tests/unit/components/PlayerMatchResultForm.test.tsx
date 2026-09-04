// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

const cleanupPreparedReplayUploadsMock = vi.hoisted(() => vi.fn());
const finalizeMatchResultMock = vi.hoisted(() => vi.fn());
const prepareMatchReplayUploadsMock = vi.hoisted(() => vi.fn());
const submitNoShowReportMock = vi.hoisted(() => vi.fn());
const uploadToSignedUrlMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const getTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/tournaments/match-actions", () => ({
  cleanupPreparedReplayUploads: cleanupPreparedReplayUploadsMock,
  finalizeMatchResult: finalizeMatchResultMock,
  prepareMatchReplayUploads: prepareMatchReplayUploadsMock,
  submitNoShowReport: submitNoShowReportMock,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

vi.mock("@/lib/supabase-browser", () => ({
  createAuthenticatedBrowserSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ uploadToSignedUrl: uploadToSignedUrlMock })),
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import PlayerMatchResultForm from "@/components/PlayerMatchResultForm";
import type { GeneratedTournamentMatch } from "@/lib/tournaments";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ONE_REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_TWO_REGISTRATION_ID = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_ID = "44444444-4444-4444-8444-444444444444";
const firstPath = `${MATCH_ID}/${ATTEMPT_ID}/game-1-55555555-5555-4555-8555-555555555555.rec`;
const secondPath = `${MATCH_ID}/${ATTEMPT_ID}/game-2-66666666-6666-4666-8666-666666666666.rec`;

const match: GeneratedTournamentMatch = {
  id: MATCH_ID,
  seriesBestOf: 3,
  roundName: "Final",
  roundNumber: 1,
  matchNumber: 1,
  status: "in_progress",
  activationVersion: 1,
  activatedAt: "2026-08-13T00:00:00.000Z",
  deadlineAt: "2026-08-14T00:00:00.000Z",
  outcomeType: null,
  deadlineRuledAt: null,
  extensionMinutes: null,
  extendedAt: null,
  holdStartedAt: null,
  holdReleasedAt: null,
  playerOneRegistrationId: PLAYER_ONE_REGISTRATION_ID,
  playerTwoRegistrationId: PLAYER_TWO_REGISTRATION_ID,
  playerOneSlot: 1,
  playerTwoSlot: 2,
  playerOneScore: null,
  playerTwoScore: null,
  winnerRegistrationId: null,
};

function renderResultForm() {
  return render(
    <PlayerMatchResultForm
      match={match}
      playerOneName="Player One"
      playerTwoName="Player Two"
      viewerRegistrationId={PLAYER_ONE_REGISTRATION_ID}
    />
  );
}

function selectValidResult(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  fireEvent.change(screen.getByLabelText("Score"), {
    target: { value: "2-0" },
  });
  const files = [
    new File(["game-one"], "private-original-one.REC"),
    new File(["game-two"], "private-original-two.rec"),
  ];
  files.forEach((file, index) =>
    fireEvent.change(screen.getByLabelText("Game " + (index + 1) + " replay"), {
      target: { files: [file] },
    })
  );
  return {
    fileInput: container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement,
    files,
  };
}

function recursivelyContainsFileBody(value: unknown): boolean {
  if (value instanceof File || value instanceof FormData) return true;
  if (Array.isArray(value)) return value.some(recursivelyContainsFileBody);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(recursivelyContainsFileBody);
  }
  return false;
}

describe("PlayerMatchResultForm direct replay transport", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    cleanupPreparedReplayUploadsMock.mockReset();
    finalizeMatchResultMock.mockReset();
    prepareMatchReplayUploadsMock.mockReset();
    submitNoShowReportMock.mockReset();
    uploadToSignedUrlMock.mockReset();
    refreshMock.mockReset();
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue("mock-clerk-token");
    localStorage.clear();
    sessionStorage.clear();

    cleanupPreparedReplayUploadsMock.mockResolvedValue({
      status: "success",
      removedCount: 0,
    });
    prepareMatchReplayUploadsMock.mockResolvedValue({
      status: "success",
      bucket: "match-proofs",
      attemptId: ATTEMPT_ID,
      uploads: [
        { gameNumber: 1, path: firstPath, token: "native-token-one" },
        { gameNumber: 2, path: secondPath, token: "native-token-two" },
      ],
    });
    uploadToSignedUrlMock.mockImplementation(async (path: string) => ({
      data: { path },
      error: null,
    }));
    finalizeMatchResultMock.mockResolvedValue({
      status: "success",
      message: "Submission #1 is awaiting opponent confirmation.",
    });
  });

  it("sends File bodies only to Supabase and finalizes with metadata only", async () => {
    const { container } = renderResultForm();
    const { files } = selectValidResult(container);
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "gg" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    await waitFor(() => expect(finalizeMatchResultMock).toHaveBeenCalledOnce());

    const prepareInput = prepareMatchReplayUploadsMock.mock.calls[0][0];
    expect(prepareInput).toEqual({
      matchId: MATCH_ID,
      playerOneScore: 2,
      playerTwoScore: 0,
      winnerRegistrationId: PLAYER_ONE_REGISTRATION_ID,
      replayFiles: [
        { name: "private-original-one.REC", size: 8 },
        { name: "private-original-two.rec", size: 8 },
      ],
      gameWinnerRegistrationIds: [
        PLAYER_ONE_REGISTRATION_ID,
        PLAYER_ONE_REGISTRATION_ID,
      ],
    });
    expect(recursivelyContainsFileBody(prepareInput)).toBe(false);

    expect(uploadToSignedUrlMock).toHaveBeenNthCalledWith(
      1,
      firstPath,
      "native-token-one",
      files[0],
      {
        cacheControl: "3600",
        contentType: "application/octet-stream",
        upsert: false,
      }
    );
    expect(uploadToSignedUrlMock).toHaveBeenNthCalledWith(
      2,
      secondPath,
      "native-token-two",
      files[1],
      {
        cacheControl: "3600",
        contentType: "application/octet-stream",
        upsert: false,
      }
    );

    const finalInput = finalizeMatchResultMock.mock.calls[0][0];
    expect(finalInput).toEqual({
      matchId: MATCH_ID,
      attemptId: ATTEMPT_ID,
      playerOneScore: 2,
      playerTwoScore: 0,
      winnerRegistrationId: PLAYER_ONE_REGISTRATION_ID,
      notes: "gg",
    });
    expect(recursivelyContainsFileBody(finalInput)).toBe(false);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toContain("native-token");
    expect(container.textContent).not.toContain(firstPath);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(cleanupPreparedReplayUploadsMock).not.toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("derives the final and remaining Game winners while preserving ordered replay transport", async () => {
    prepareMatchReplayUploadsMock.mockResolvedValueOnce({
      status: "error",
      message: "stopped",
    });
    renderResultForm();
    fireEvent.click(screen.getByRole("button", { name: "Won" }));
    fireEvent.change(screen.getByLabelText("Score"), {
      target: { value: "2-1" },
    });
    expect(screen.getAllByText("Determined by the result")).toHaveLength(1);
    const files = [1, 2, 3].map(
      (i) => new File([String(i)], "game-" + i + ".rec")
    );
    files.forEach((file, i) =>
      fireEvent.change(screen.getByLabelText("Game " + (i + 1) + " replay"), {
        target: { files: [file] },
      })
    );
    const group = screen.getByRole("group", { name: "Game 1 winner" });
    fireEvent.click(within(group).getByRole("button", { name: "Player Two" }));
    expect(screen.getAllByText("Determined by the result")).toHaveLength(2);
    expect(
      screen.queryByRole("group", { name: "Game 2 winner" })
    ).not.toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit Result" }).closest("form")!
    );
    await waitFor(() =>
      expect(prepareMatchReplayUploadsMock).toHaveBeenCalledOnce()
    );
    expect(prepareMatchReplayUploadsMock.mock.calls[0][0]).toMatchObject({
      playerOneScore: 2,
      playerTwoScore: 1,
      winnerRegistrationId: PLAYER_ONE_REGISTRATION_ID,
      gameWinnerRegistrationIds: [
        PLAYER_TWO_REGISTRATION_ID,
        PLAYER_ONE_REGISTRATION_ID,
        PLAYER_ONE_REGISTRATION_ID,
      ],
      replayFiles: files.map((file) => ({ name: file.name, size: file.size })),
    });
  });

  it("reconciles score rows, Replace, Remove, and outcome changes without stale winners", () => {
    const { container } = renderResultForm();
    selectValidResult(container);
    fireEvent.change(screen.getByLabelText("Score"), {
      target: { value: "2-1" },
    });
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(3);
    expect(screen.getByText("private-original-one.REC")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Game 1 replay"), {
      target: { files: [new File(["replacement"], "replaced.rec")] },
    });
    expect(
      screen.queryByText("private-original-one.REC")
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove replay" })[0]
    );
    expect(screen.queryByText("replaced.rec")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Score"), {
      target: { value: "2-0" },
    });
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Lost" }));
    expect(screen.getByLabelText("Score")).toHaveValue("");
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(0);
    expect(
      screen.queryByText("private-original-two.rec")
    ).not.toBeInTheDocument();
  });

  it.each([
    ["empty.rec", 0],
    ["wrong.txt", 1],
    ["large.rec", 10 * 1024 * 1024 + 1],
  ])("rejects invalid replay %s", (name, size) => {
    const { container } = renderResultForm();
    selectValidResult(container);
    const file = new File(["x"], name);
    Object.defineProperty(file, "size", { value: size });
    fireEvent.change(screen.getByLabelText("Game 1 replay"), {
      target: { files: [file] },
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit Result" })
    ).toBeDisabled();
  });

  it("shows localized duplicate replay feedback and keeps selected files available", async () => {
    const serverFallback = "SERVER_FALLBACK_MUST_NOT_RENDER";
    finalizeMatchResultMock.mockResolvedValue({
      status: "error",
      code: "duplicate_replay",
      message: serverFallback,
    });
    const { container } = renderResultForm();
    const { files } = selectValidResult(container);

    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    expect(
      await screen.findByText(competitionEnglish.matchAction.duplicateReplay)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(competitionEnglish.matchAction.operationFailed)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(serverFallback)).not.toBeInTheDocument();
    expect(screen.getByText(files[0].name)).toBeInTheDocument();
    expect(screen.getByText(files[1].name)).toBeInTheDocument();
    expect(finalizeMatchResultMock).toHaveBeenCalledOnce();
    expect(cleanupPreparedReplayUploadsMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows bounded upload state and disables conflicting submission", async () => {
    let resolvePreparation!: (value: unknown) => void;
    prepareMatchReplayUploadsMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePreparation = resolve;
      })
    );
    const { container } = renderResultForm();
    selectValidResult(container);
    const form = screen
      .getByRole("button", { name: "Submit Result" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(
      await screen.findAllByText("Preparing secure replay uploads…")
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Preparing secure replay uploads…" })
    ).toBeDisabled();
    expect(
      screen.queryByText(competitionEnglish.resultUx.noShow)
    ).not.toBeInTheDocument();

    resolvePreparation({
      status: "error",
      message: "The replay upload could not be prepared. Please try again.",
    });
    expect(
      await screen.findByText(
        "The replay upload could not be prepared. Please try again."
      )
    ).toBeInTheDocument();
  });

  it("shows upload progress and ignores rapid duplicate submission", async () => {
    let resolveFirstUpload!: (value: unknown) => void;
    uploadToSignedUrlMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstUpload = resolve;
        })
    );
    const { container } = renderResultForm();
    selectValidResult(container);
    const form = screen
      .getByRole("button", { name: "Submit Result" })
      .closest("form") as HTMLFormElement;

    fireEvent.submit(form);
    expect(
      await screen.findAllByText("Uploading Game 1 of 2…")
    ).not.toHaveLength(0);
    fireEvent.submit(form);
    expect(prepareMatchReplayUploadsMock).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Uploading Game 1 of 2…" })
    ).toBeDisabled();
    expect(
      screen.queryByText(competitionEnglish.resultUx.noShow)
    ).not.toBeInTheDocument();

    resolveFirstUpload({ data: { path: firstPath }, error: null });
    await waitFor(() => expect(finalizeMatchResultMock).toHaveBeenCalledOnce());
  });

  it("keeps selected files after a fixed safe upload error and cleans known paths", async () => {
    const privateProviderError =
      "signed-token secret private/path provider diagnostic";
    uploadToSignedUrlMock.mockResolvedValue({
      data: null,
      error: { message: privateProviderError },
    });
    const { container } = renderResultForm();
    const { files } = selectValidResult(container);
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    expect(
      await screen.findByText(
        "The replay upload failed. Your selected files are still available; please try again."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(files[0].name)).toBeInTheDocument();
    expect(cleanupPreparedReplayUploadsMock).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(finalizeMatchResultMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(privateProviderError);
    expect(container.textContent).not.toContain("native-token");
    expect(container.textContent).not.toContain(firstPath);
  });

  it("cleans the known attempt when a later upload fails after one succeeds", async () => {
    uploadToSignedUrlMock
      .mockResolvedValueOnce({ data: { path: firstPath }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "private provider failure" },
      });
    const { container } = renderResultForm();
    selectValidResult(container);
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    await screen.findByText(
      "The replay upload failed. Your selected files are still available; please try again."
    );
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(2);
    expect(cleanupPreparedReplayUploadsMock).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(finalizeMatchResultMock).not.toHaveBeenCalled();
  });

  it("rejects an unexpected returned path without exposing capability details", async () => {
    uploadToSignedUrlMock.mockResolvedValue({
      data: { path: `${MATCH_ID}/wrong-attempt/private.rec` },
      error: null,
    });
    const { container } = renderResultForm();
    selectValidResult(container);
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    expect(
      await screen.findByText(
        "The replay upload failed. Your selected files are still available; please try again."
      )
    ).toBeInTheDocument();
    expect(finalizeMatchResultMock).not.toHaveBeenCalled();
    expect(cleanupPreparedReplayUploadsMock).toHaveBeenCalledOnce();
    expect(container.innerHTML).not.toContain("native-token");
  });

  it("never starts browser cleanup after finalization has been dispatched", async () => {
    finalizeMatchResultMock.mockRejectedValue(
      new Error("response lost while authoritative RPC may still be in flight")
    );
    const { container } = renderResultForm();
    selectValidResult(container);
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    expect(
      await screen.findByText(competitionEnglish.resultForm.responseUnknown)
    ).toBeInTheDocument();
    expect(finalizeMatchResultMock).toHaveBeenCalledOnce();
    expect(cleanupPreparedReplayUploadsMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Submit Result" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh match" }));
    expect(prepareMatchReplayUploadsMock).toHaveBeenCalledOnce();
    expect(finalizeMatchResultMock).toHaveBeenCalledOnce();
  });

  it("locks conflicting retry paths when the server requires a match refresh", async () => {
    finalizeMatchResultMock.mockResolvedValue({
      status: "error",
      message: "The result outcome is uncertain. Refresh this match.",
      requiresRefresh: true,
    });
    const { container } = renderResultForm();
    selectValidResult(container);
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Submit Result",
        })
        .closest("form") as HTMLFormElement
    );

    await screen.findByText(competitionEnglish.resultForm.responseUnknown);
    expect(
      screen.queryByRole("button", { name: "Submit Result" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh match" }));
    expect(cleanupPreparedReplayUploadsMock).not.toHaveBeenCalled();
  });

  it("keeps no-show replay-independent and contains no screenshot-proof UI", () => {
    const { container } = renderResultForm();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toMatch(/screenshot proof/i);
    fireEvent.click(screen.getByText(competitionEnglish.resultUx.noShow));
    expect(
      screen.getByRole("button", { name: "Submit No-Show Report" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/confirmed no-show may affect leaderboard/i)
    ).toBeInTheDocument();
  });
});
