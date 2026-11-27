// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CasterShowcaseCarousel, { CASTER_SHOWCASE_PIXELS_PER_SECOND } from "@/components/caster/CasterShowcaseCarousel";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import type { PublicCasterCard } from "@/lib/caster/publication";

const copy = getPublicCasterCopy("en");
const cards: PublicCasterCard[] = ["Able", "Bravo", "Charlie"].map((display_name) => ({
  slug: display_name.toLowerCase(), publication_id: "35000000-0000-4000-8000-000000000001", display_name,
  avatar: "25000000-0000-4000-8000-000000000001", languages: ["English"], games: ["Company of Heroes 3"], platforms: ["youtube"],
}));

let reportSize: (() => void) | undefined;
class Measurer {
  constructor(listener: () => void) { reportSize = listener; }
  observe() {}
  disconnect() {}
}

function motionPreference(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

function renderShowcase(casters = cards, width = 750, distance = 900) {
  const mounted = render(<><h2 id="official-caster-showcase">{copy.showcase}</h2><CasterShowcaseCarousel casters={casters} copy={copy} /></>);
  const viewport = mounted.container.querySelector("[data-caster-showcase-viewport]");
  const group = mounted.container.querySelector<HTMLElement>("[data-caster-original]");
  if (viewport && group) {
    Object.defineProperty(viewport, "clientWidth", { value: width });
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue({ width: distance, left: 0 } as DOMRect);
    [...group.children].forEach((card, index) => Object.defineProperty(card, "offsetLeft", { value: index * distance / casters.length }));
    act(() => reportSize?.());
  }
  return { ...mounted, viewport: viewport as HTMLElement };
}

beforeEach(() => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("ResizeObserver", Measurer);
  motionPreference(false);
});

afterEach(() => {
  cleanup();
  reportSize = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("official caster showcase", () => {
  it("keeps the same speed and fills the viewport at the loop boundary with a small roster", () => {
    const { container, viewport } = renderShowcase(cards.slice(0, 2), 1150, 580);
    const track = container.querySelector<HTMLElement>("[data-caster-showcase-track]")!;
    expect(CASTER_SHOWCASE_PIXELS_PER_SECOND).toBe(22);
    expect(track.style.getPropertyValue("--caster-distance")).toBe("580px");
    expect(track.style.getPropertyValue("--caster-duration")).toBe(`${580 / 22}s`);
    expect(viewport).toHaveAttribute("data-mode", "moving");
    expect(container.querySelectorAll("[data-caster-repeat]")).toHaveLength(2);
  });

  it("shows one accessible link per caster and keeps its visual copies pointer-navigable", () => {
    const { container } = renderShowcase();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/casters/able", "/casters/bravo", "/casters/charlie"]);
    const copies = container.querySelectorAll("[data-caster-repeat] a");
    expect(copies.length).toBeGreaterThan(0);
    for (const link of copies) {
      expect(link).toHaveAttribute("tabindex", "-1");
      expect(link).toHaveAttribute("href", expect.stringMatching(/^\/casters\/(able|bravo|charlie)$/));
      expect(link.closest("[data-caster-repeat]")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("pauses and resumes without rebuilding the real track and provides static manual navigation", () => {
    const { viewport, container } = renderShowcase();
    const original = container.querySelector("[data-caster-original]");
    fireEvent.click(screen.getByRole("button", { name: copy.pause }));
    expect(viewport).toHaveAttribute("data-paused", "true");
    expect(viewport).toHaveAttribute("data-mode", "moving");
    fireEvent.click(screen.getByRole("button", { name: copy.resume }));
    expect(viewport).not.toHaveAttribute("data-paused");

    fireEvent.click(screen.getByRole("button", { name: copy.next }));
    expect(viewport).toHaveAttribute("data-mode", "browse");
    expect(viewport.scrollLeft).toBe(300);
    fireEvent.click(screen.getByRole("button", { name: copy.resume }));
    expect(viewport).toHaveAttribute("data-mode", "moving");
    expect(container.querySelector("[data-caster-original]")).toBe(original);
  });

  it("reveals a focused card and makes the next keyboard movement explicit", () => {
    const { viewport } = renderShowcase();
    const links = screen.getAllByRole("link");
    for (const link of links) {
      const matches = link.matches.bind(link);
      vi.spyOn(link, "matches").mockImplementation((selector) => selector === ":focus-visible" || matches(selector));
    }
    act(() => links[1].focus());
    expect(viewport).toHaveAttribute("data-mode", "browse");
    expect(viewport.scrollLeft).toBe(300);
    fireEvent.keyDown(links[1], { key: "ArrowRight" });
    expect(links[2]).toHaveFocus();
    expect(viewport.scrollLeft).toBe(600);
  });

  it("keeps reduced motion static and keeps all original links and navigation available", () => {
    motionPreference(true);
    const { viewport } = renderShowcase();
    expect(viewport).toHaveAttribute("data-mode", "browse");
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: copy.pause })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.previous }));
    expect(viewport.scrollLeft).toBe(600);
  });

  it("uses a static presentation for one eligible caster and omits an empty showcase", () => {
    const mounted = renderShowcase(cards.slice(0, 1));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/casters/able");
    expect(screen.queryByRole("button")).toBeNull();
    mounted.rerender(<CasterShowcaseCarousel casters={[]} copy={copy} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
