// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InfoTooltip from "@/components/InfoTooltip";

afterEach(() => {
  cleanup();
});

describe("InfoTooltip", () => {
  it("supports hover, focus, touch-style activation, and Escape dismissal", () => {
    render(
      <div>
        <InfoTooltip label="About the rule" content="Approved rule detail." />
        <button type="button">Outside</button>
      </div>
    );

    const trigger = screen.getByRole("button", { name: "About the rule" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Approved rule detail."
    );

    fireEvent.mouseLeave(trigger.parentElement as HTMLElement);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
