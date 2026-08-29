// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RegistrationGuidanceDisclosure from "@/components/RegistrationGuidanceDisclosure";

afterEach(() => {
  cleanup();
});

describe("RegistrationGuidanceDisclosure", () => {
  it("renders a closed native disclosure with an accessible, touch-sized summary", () => {
    render(<RegistrationGuidanceDisclosure />);

    const label = screen.getByText("How Registration Works");
    const summary = label.closest("summary");
    const details = summary?.closest("details");

    expect(summary).not.toBeNull();
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(summary).toHaveClass("min-h-11");
    expect(summary?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(details?.querySelector("button")).toBeNull();
  });

  it("explains the approved Registration lifecycle and Match timing", () => {
    render(<RegistrationGuidanceDisclosure />);

    const disclosure = screen
      .getByText("How Registration Works")
      .closest("details");

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

    const disclosure = screen
      .getByText("How Registration Works")
      .closest("details");
    const copy = disclosure?.textContent.toLowerCase() ?? "";

    expect(copy).not.toContain("9 days");
    expect(copy).not.toContain("automatic extension");
    expect(copy).not.toContain("automatically launches");
    expect(copy).not.toContain("automatically starts");
  });
});
