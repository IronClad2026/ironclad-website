// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NavbarMoreMenu from "@/components/NavbarMoreMenu";

afterEach(cleanup);

function renderMenu(active = false) {
  render(<><NavbarMoreMenu label="More" aboutLabel="About" active={active} /><button type="button">Outside</button></>);
  return screen.getByRole("button", { name: "More" });
}

describe("Navbar More disclosure", () => {
  it("exposes About on activation with expanded state and keyboard focus", () => {
    const trigger = renderMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "About" })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const about = screen.getByRole("link", { name: "About" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(about).toHaveAttribute("href", "/about");
    expect(about.parentElement).toHaveAttribute("id", trigger.getAttribute("aria-controls"));
    expect(about).toHaveFocus();
  });

  it("opens with ArrowDown and closes with Escape, restoring trigger focus", () => {
    const trigger = renderMenu();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const about = screen.getByRole("link", { name: "About" });
    expect(about).toHaveFocus();
    fireEvent.keyDown(about, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("link", { name: "About" })).not.toBeInTheDocument();
  });

  it("closes on an outside pointer without stealing focus from that target", () => {
    const trigger = renderMenu();
    fireEvent.click(trigger);
    const outside = screen.getByRole("button", { name: "Outside" });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(outside).toHaveFocus();
  });

  it("closes when keyboard focus leaves the disclosure", () => {
    const trigger = renderMenu();
    fireEvent.click(trigger);
    fireEvent.blur(screen.getByRole("link", { name: "About" }), { relatedTarget: screen.getByRole("button", { name: "Outside" }) });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("marks About current without claiming the More trigger is a page", () => {
    const trigger = renderMenu(true);
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(trigger).not.toHaveAttribute("aria-current");
  });
});
