// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteIronCladAccountMock = vi.hoisted(() =>
  vi.fn(async (...args: [unknown, FormData]) => {
    void args;
    return {
      status: "idle",
      message: "",
    };
  })
);

vi.mock("@/app/profile/delete-account-action", () => ({
  deleteIronCladAccount: deleteIronCladAccountMock,
}));

import DeleteAccountSection from "@/components/DeleteAccountSection";
import englishAccountDictionary from "@/lib/i18n/dictionaries/en/account-dashboard";

const copy = englishAccountDictionary.deleteAccount;

beforeEach(() => {
  deleteIronCladAccountMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("DeleteAccountSection", () => {
  it("is a compact, accessible disclosure by default", () => {
    render(<DeleteAccountSection />);

    const trigger = screen.getByRole("button", { name: copy.title });

    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls");
    expect(
      screen.getByRole("heading", { level: 2, name: copy.title })
    ).toContainElement(trigger);
    expect(screen.queryByRole("region", { name: copy.title })).toBeNull();
    expect(screen.queryByText(copy.description)).toBeNull();
    expect(screen.queryByText(copy.warning)).toBeNull();
  });

  it("expands inline and preserves the exact destructive confirmation gate", () => {
    render(<DeleteAccountSection />);

    const trigger = screen.getByRole("button", { name: copy.title });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: copy.title })).toHaveAttribute(
      "id",
      trigger.getAttribute("aria-controls")
    );
    expect(screen.getByText(copy.description)).toBeVisible();
    expect(screen.getByText(copy.warning)).toBeVisible();

    const confirmation = screen.getByLabelText(copy.typeDelete);
    const deleteButton = screen.getByRole("button", {
      name: copy.permanentlyDelete,
    });

    expect(deleteButton).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: "delete" } });
    expect(deleteButton).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: "DELETE" } });
    expect(deleteButton).toBeEnabled();
  });

  it("clears confirmation on trigger collapse and reopens clean", () => {
    render(<DeleteAccountSection />);

    const trigger = screen.getByRole("button", { name: copy.title });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.change(screen.getByLabelText(copy.typeDelete), {
      target: { value: "DELETE" },
    });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(screen.queryByLabelText(copy.typeDelete)).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByLabelText(copy.typeDelete)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: copy.permanentlyDelete })
    ).toBeDisabled();
  });

  it("returns focus and clears confirmation when Cancel collapses the section", () => {
    render(<DeleteAccountSection />);

    const trigger = screen.getByRole("button", { name: copy.title });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText(copy.typeDelete), {
      target: { value: "DELETE" },
    });

    fireEvent.click(screen.getByRole("button", { name: copy.cancel }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(screen.getByLabelText(copy.typeDelete)).toHaveValue("");
  });

  it("preserves the existing server action confirmation contract", async () => {
    render(<DeleteAccountSection />);

    fireEvent.click(screen.getByRole("button", { name: copy.title }));
    fireEvent.change(screen.getByLabelText(copy.typeDelete), {
      target: { value: "DELETE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: copy.permanentlyDelete })
    );

    await waitFor(() => expect(deleteIronCladAccountMock).toHaveBeenCalledOnce());
    expect(deleteIronCladAccountMock.mock.calls[0][0]).toMatchObject({
      status: "idle",
      message: "",
    });
    const submittedForm = deleteIronCladAccountMock.mock.calls[0][1] as FormData;
    expect(submittedForm).toBeInstanceOf(FormData);
    expect(submittedForm.get("confirmation")).toBe("DELETE");
  });
});
