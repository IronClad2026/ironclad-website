// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CasterShowcaseCarousel, { CASTER_SHOWCASE_DWELL_MS } from "@/components/caster/CasterShowcaseCarousel";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import type { PublicCasterCard } from "@/lib/caster/publication";

const copy = getPublicCasterCopy("en");
const cards: PublicCasterCard[] = ["Able", "Bravo", "Charlie"].map((display_name) => ({
  slug: display_name.toLowerCase(), publication_id: "35000000-0000-4000-8000-000000000001", display_name,
  avatar: "25000000-0000-4000-8000-000000000001", languages: ["English"], games: ["Company of Heroes 3"], platforms: ["youtube"],
}));

function motionPreference(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

function renderShowcase(casters = cards) {
  return render(<><h2 id="official-caster-showcase">{copy.showcase}</h2><CasterShowcaseCarousel casters={casters} copy={copy} /></>);
}

function passTime(ms = CASTER_SHOWCASE_DWELL_MS) {
  act(() => { vi.advanceTimersByTime(ms); });
}

function current(name: string) {
  expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute("href", `/casters/${name.toLowerCase()}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  motionPreference(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("official caster showcase", () => {
  it("uses the same dwell time for every eligible card and loops", () => {
    renderShowcase();
    for (const [name, next] of [["Able", "Bravo"], ["Bravo", "Charlie"], ["Charlie", "Able"]]) {
      passTime(CASTER_SHOWCASE_DWELL_MS - 1);
      current(name);
      passTime(1);
      current(next);
    }
  });

  it("pauses for hover and focus and keeps manual interaction paused until resumed", () => {
    renderShowcase();
    const carousel = screen.getByRole("group", { name: copy.showcase });
    const next = screen.getByRole("button", { name: copy.next });
    fireEvent.mouseEnter(carousel);
    passTime();
    current("Able");

    fireEvent.mouseLeave(carousel);
    fireEvent.focusIn(next);
    passTime();
    current("Able");

    fireEvent.keyDown(next, { key: "ArrowRight" });
    fireEvent.focusOut(next);
    passTime();
    current("Bravo");
    fireEvent.click(screen.getByRole("button", { name: copy.resume }));
    passTime();
    current("Charlie");

    fireEvent.click(screen.getByRole("button", { name: copy.pause }));
    passTime();
    current("Charlie");
  });

  it("supports a horizontal touch swipe and does not advance for vertical scrolling", () => {
    renderShowcase();
    const link = screen.getByRole("link");
    const primaryTouch = { pointerType: "touch", isPrimary: true };
    fireEvent.pointerDown(link, { ...primaryTouch, clientX: 160, clientY: 40 });
    fireEvent.pointerUp(link, { ...primaryTouch, clientX: 154, clientY: 128 });
    passTime();
    current("Able");

    fireEvent.pointerDown(link, { ...primaryTouch, clientX: 160, clientY: 40 });
    fireEvent.pointerUp(link, { ...primaryTouch, clientX: 65, clientY: 48 });
    current("Bravo");
  });

  it("starts without rotation for reduced motion while retaining previous and next", () => {
    motionPreference(true);
    renderShowcase();
    passTime();
    current("Able");
    expect(screen.queryByRole("button", { name: copy.pause })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.previous }));
    current("Charlie");
  });

  it("has no carousel controls when there is one eligible profile and no card when there are none", () => {
    const mounted = renderShowcase(cards.slice(0, 1));
    current("Able");
    expect(screen.queryByRole("button")).toBeNull();
    mounted.rerender(<CasterShowcaseCarousel casters={[]} copy={copy} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
