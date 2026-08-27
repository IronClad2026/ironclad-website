// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NavbarSupportPopover from "@/components/NavbarSupportPopover";

const props = {
  href: "https://support.example.test/ironclad",
  triggerLabel: "Apri assistenza",
  title: "Serve aiuto?",
  copy: "Contatta il supporto IronClad.",
  actionLabel: "Apri supporto",
};

afterEach(() => {
  cleanup();
});

describe("NavbarSupportPopover", () => {
  it("renders a compact accessible trigger and localized support card", () => {
    render(<NavbarSupportPopover {...props} />);

    const trigger = screen.getByRole("button", { name: props.triggerLabel });
    const controlledId = trigger.getAttribute("aria-controls");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveClass("h-11", "w-11");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: props.title });
    const action = within(dialog).getByRole("link", {
      name: props.actionLabel,
    });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("id", controlledId);
    expect(dialog).toHaveAccessibleDescription(props.copy);
    expect(dialog).toHaveClass(
      "top-full",
      "mt-3",
      "max-h-[calc(100dvh-6rem)]",
      "max-w-[calc(100vw-2rem)]",
      "overflow-y-auto"
    );
    expect(action).toHaveFocus();
    expect(action).toHaveAttribute("href", props.href);
    expect(action).toHaveAttribute("target", "_blank");
    expect(action).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("can open above the trigger inside the mobile utility area", () => {
    render(<NavbarSupportPopover {...props} placement="above" />);

    fireEvent.click(
      screen.getByRole("button", { name: props.triggerLabel })
    );

    expect(screen.getByRole("dialog", { name: props.title })).toHaveClass(
      "bottom-full",
      "mb-3"
    );
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render(<NavbarSupportPopover {...props} />);

    const trigger = screen.getByRole("button", { name: props.triggerLabel });
    fireEvent.click(trigger);

    const action = screen.getByRole("link", { name: props.actionLabel });
    action.focus();
    expect(action).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside pointer interaction", () => {
    render(
      <div>
        <NavbarSupportPopover {...props} />
        <button type="button">Outside</button>
      </div>
    );

    fireEvent.click(
      screen.getByRole("button", { name: props.triggerLabel })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
