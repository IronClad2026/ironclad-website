// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RegistrationGuidanceDisclosure from "@/components/RegistrationGuidanceDisclosure";

afterEach(() => {
  cleanup();
});

describe("RegistrationGuidanceDisclosure", () => {
  it("renders a closed native disclosure with an accessible, touch-sized summary", () => {
    render(<RegistrationGuidanceDisclosure />);

    const details = document.querySelector("details");
    const label = within(details as HTMLElement).getByText(
      "How Registration Works"
    );
    const summary = label.closest("summary");

    expect(summary).not.toBeNull();
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(summary).toHaveClass("min-h-11");
    expect(
      summary?.querySelector("[data-registration-guidance-icon]")
    ).toHaveClass("h-7", "w-7", "rounded-full", "border");
    expect(details?.querySelector("button")).toBeNull();

    fireEvent.click(summary as HTMLElement);
    expect(details).toHaveAttribute("open");
  });

  it("explains the approved Registration lifecycle and Match timing", () => {
    render(<RegistrationGuidanceDisclosure />);

    const disclosure = document.querySelector("details");

    expect(disclosure).not.toBeNull();
    const guidance = within(disclosure as HTMLElement);

    expect(
      guidance.getByRole("heading", {
        name: "What Happens After You Register?",
      })
    ).toBeInTheDocument();
    expect(guidance.getByText("Admin Review")).toBeInTheDocument();
    expect(guidance.getByText("Approval")).toBeInTheDocument();
    expect(guidance.getByText("Division Ready")).toBeInTheDocument();
    expect(guidance.getByText("Tournament Launch")).toBeInTheDocument();
    expect(disclosure).toHaveTextContent(
      "Exactly 8 approved Players are required before the Division can be prepared for launch."
    );
    expect(disclosure).toHaveTextContent("Launch is not automatic.");
    expect(disclosure).toHaveTextContent(
      "then an Admin launches the Division."
    );
    expect(disclosure).toHaveTextContent(
      "Once your matchup becomes active, you normally have 7 days to complete it."
    );
    expect(disclosure).toHaveTextContent(
      "Your exact deadline is shown with the Match"
    );
    expect(disclosure).toHaveTextContent(
      "Any extension is exceptional, must be granted by an Admin, and is not guaranteed."
    );
  });

  it("does not introduce forbidden timing or automatic behavior claims", () => {
    render(<RegistrationGuidanceDisclosure />);

    const disclosure = document.querySelector("details");
    const copy = disclosure?.textContent.toLowerCase() ?? "";

    expect(copy).not.toContain("9 days");
    expect(copy).not.toContain("automatic extension");
    expect(copy).not.toContain("automatically launches");
    expect(copy).not.toContain("automatically starts");
  });

  it("uses a desktop dialog that closes by X, backdrop, and Escape", () => {
    render(<RegistrationGuidanceDisclosure />);

    const trigger = screen.getByRole("button", {
      name: "How Registration Works",
    });

    fireEvent.click(trigger);
    let dialog = screen.getByRole("dialog", {
      name: "What Happens After You Register?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByText(
        "Exactly 8 approved Players are required before the Division can be prepared for launch."
      )
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const backdrop = document.querySelector(
      "[data-registration-guidance-backdrop]"
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    dialog = screen.getByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).not.toBeInTheDocument();
  });
});
