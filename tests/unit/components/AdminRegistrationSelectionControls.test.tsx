// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminRegistrationApproveSelected from "@/components/AdminRegistrationApproveSelected";
import AdminRegistrationSelectAll from "@/components/AdminRegistrationSelectAll";

function SelectionFixture() {
  return (
    <>
      <form id="bulk-approval" />
      <input
        form="bulk-approval"
        type="checkbox"
        name="registrationId"
        value="pending-1"
        data-registration-selection="true"
        data-registration-selection-scope="tournament-1"
        aria-label="Pending one"
      />
      <input
        form="bulk-approval"
        type="checkbox"
        name="registrationId"
        value="manual-review-1"
        data-registration-selection="true"
        data-registration-selection-scope="tournament-1"
        aria-label="Manual review one"
      />
      <input
        form="bulk-approval"
        type="checkbox"
        name="registrationId"
        value="rejected-1"
        data-registration-selection="true"
        data-registration-selection-scope="tournament-1"
        aria-label="Rejected one"
        disabled
      />
      <input
        form="bulk-approval"
        type="checkbox"
        name="registrationId"
        value="pending-2"
        data-registration-selection="true"
        data-registration-selection-scope="tournament-2"
        aria-label="Pending two"
      />
      <AdminRegistrationSelectAll
        formId="bulk-approval"
        name="registrationId"
        scope="tournament-1"
        showLabel
      />
      <AdminRegistrationApproveSelected
        formId="bulk-approval"
        name="registrationId"
        scope="tournament-1"
      />
    </>
  );
}

describe("administrator registration bulk-selection controls", () => {
  afterEach(cleanup);

  it("enables Approve Selected only for the checked eligible scope", async () => {
    render(<SelectionFixture />);

    const selectAll = screen.getByRole("checkbox", {
      name: "Select all visible registrations",
    });
    const approve = screen.getByRole("button", { name: "Approve Selected" });

    expect(approve).toBeDisabled();
    fireEvent.click(selectAll);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Approve Selected (2)" })
      ).toBeEnabled();
    });
    expect(screen.getByRole("checkbox", { name: "Pending one" }))
      .toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Manual review one" }))
      .toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Rejected one" }))
      .not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pending two" }))
      .not.toBeChecked();
  });

  it("reconciles the selected count when an eligible row is unchecked", async () => {
    render(<SelectionFixture />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all visible registrations",
      })
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Pending one" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Approve Selected (1)" })
      ).toBeEnabled();
    });
    expect(
      screen.getByRole("checkbox", {
        name: "Select all visible registrations",
      })
    ).toBePartiallyChecked();
  });

  it("keeps both mobile bulk controls touch-safe", () => {
    render(<SelectionFixture />);

    expect(
      screen.getByRole("checkbox", {
        name: "Select all visible registrations",
      }).parentElement
    ).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Approve Selected" }))
      .toHaveClass("min-h-11", "w-full", "sm:w-auto");
  });
});
