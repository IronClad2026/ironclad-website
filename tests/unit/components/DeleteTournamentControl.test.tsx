// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteTournamentMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/admin/tournaments/actions", () => ({
  deleteTournament: deleteTournamentMock,
}));

import DeleteTournamentControl from "@/components/DeleteTournamentControl";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const tournamentTitle = "Summer Cup";
const preview = {
  registrations: 8,
  brackets: 2,
  generated_brackets: 1,
  rounds: 3,
  matches: 7,
  standings: 8,
  result_submissions: 4,
  storage_files: 5,
};

function renderControl() {
  render(
    <DeleteTournamentControl
      tournamentId={tournamentId}
      tournamentTitle={tournamentTitle}
      editHref={`/admin/tournaments?selected=${tournamentId}`}
      preview={preview}
    />
  );

  return screen.getByRole("button", {
    name: `Tournament actions for ${tournamentTitle}`,
  });
}

function openDeletionDialog() {
  const trigger = renderControl();
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete Tournament" }));

  return {
    dialog: screen.getByRole("dialog", {
      name: "Permanently Delete Tournament",
    }),
    trigger,
  };
}

describe("DeleteTournamentControl", () => {
  beforeEach(() => {
    deleteTournamentMock.mockReset();
    deleteTournamentMock.mockResolvedValue(undefined);
    document.body.style.overflow = "";
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("describes the modal, focuses a safe control, traps Tab, and returns focus on Escape", async () => {
    const { dialog, trigger } = openDeletionDialog();
    const close = screen.getByRole("button", { name: "Close deletion modal" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirmation = screen.getByRole("textbox", {
      name: /Type DELETE to continue/,
    });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-describedby",
      `delete-tournament-description-${tournamentId}`
    );
    expect(dialog).toHaveAccessibleDescription(
      "You are about to permanently delete this tournament and all related data. This action cannot be undone."
    );
    expect(trigger).toHaveClass(
      "focus-visible:outline",
      "focus-visible:outline-2",
      "focus-visible:outline-orange-300"
    );
    for (const control of [close, confirmation, cancel]) {
      expect(control).toHaveClass(
        "focus-visible:outline",
        "focus-visible:outline-2",
        "focus-visible:outline-red-300"
      );
    }
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(cancel).toHaveFocus());

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();

    fireEvent.change(confirmation, { target: { value: "DELETE" } });
    const submit = screen.getByRole("button", {
      name: "Permanently Delete Tournament",
    });
    expect(submit).toBeEnabled();
    expect(submit).toHaveClass(
      "focus-visible:outline",
      "focus-visible:outline-2",
      "focus-visible:outline-red-300"
    );
    submit.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    trigger.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    });
  });

  it("keeps exact confirmation and Cancel behavior while resetting the next open", async () => {
    const { trigger } = openDeletionDialog();
    const confirmation = screen.getByRole("textbox", {
      name: /Type DELETE to continue/,
    });
    const submit = screen.getByRole("button", {
      name: "Permanently Delete Tournament",
    });

    fireEvent.change(confirmation, { target: { value: "delete" } });
    expect(submit).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: "DELETE" } });
    expect(submit).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete Tournament" })
    );
    expect(
      screen.getByRole("textbox", { name: /Type DELETE to continue/ })
    ).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Permanently Delete Tournament" })
    ).toBeDisabled();
  });

  it("prevents dismissal and duplicate input while deletion is pending", async () => {
    let resolveDeletion: () => void = () => undefined;
    const deletionPromise = new Promise<void>((resolve) => {
      resolveDeletion = resolve;
    });
    deleteTournamentMock.mockReturnValue(deletionPromise);

    const { dialog, trigger } = openDeletionDialog();
    const confirmation = screen.getByRole("textbox", {
      name: /Type DELETE to continue/,
    });
    fireEvent.change(confirmation, { target: { value: "DELETE" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Permanently Delete Tournament" })
    );

    const pendingSubmit = await screen.findByRole("button", {
      name: "Deleting Tournament...",
    });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(pendingSubmit).toBeDisabled();
    expect(confirmation).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Close deletion modal" })
    ).toBeDisabled();
    expect(deleteTournamentMock).toHaveBeenCalledOnce();
    const submittedForm = deleteTournamentMock.mock.calls[0][0] as FormData;
    expect(submittedForm).toBeInstanceOf(FormData);
    expect(submittedForm.get("tournamentId")).toBe(tournamentId);
    expect(submittedForm.get("confirmation")).toBe("DELETE");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      resolveDeletion();
      await deletionPromise;
    });

    await waitFor(() => {
      expect(dialog).toHaveAttribute("aria-busy", "false");
      expect(
        screen.getByRole("button", {
          name: "Permanently Delete Tournament",
        })
      ).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("allows backdrop dismissal without invoking the destructive action", async () => {
    const { trigger } = openDeletionDialog();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close tournament deletion confirmation",
      })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
    expect(deleteTournamentMock).not.toHaveBeenCalled();
  });
});
