// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type {
  AnimationEventHandler,
  HTMLAttributes,
  ImgHTMLAttributes,
  ReactNode,
} from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BadgeRevealOverlay from "@/components/badges/BadgeRevealOverlay";
import DashboardBadgesSection from "@/components/badges/DashboardBadgesSection";
import { buildDashboardBadgeData } from "@/lib/badges/dashboard";
import type {
  BadgeRevealQueueItem,
  EarnedBadgeCollectionItem,
  PlayerBadgeAward,
} from "@/lib/badges/types";

type MockImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

vi.mock("next/image", async () => {
  const react = await vi.importActual<typeof import("react")>("react");

  return {
    default: (props: MockImageProps) => {
      const imageProps = { ...props };
      delete imageProps.children;
      return react.createElement("img", imageProps);
    },
  };
});

vi.mock("framer-motion", async () => {
  const react = await vi.importActual<typeof import("react")>("react");

  type MotionMockProps = HTMLAttributes<HTMLElement> & {
    animate?: unknown;
    exit?: unknown;
    initial?: unknown;
    transition?: unknown;
    onAnimationComplete?: () => void;
    children?: ReactNode;
  };

  const makeMotionElement = (tag: "article" | "button" | "div" | "span") =>
    react.forwardRef<HTMLElement, MotionMockProps>(function MotionElement(
      props,
      ref
    ) {
      const animate = props.animate;
      const initial = props.initial;
      const onAnimationComplete = props.onAnimationComplete;
      const transition = props.transition;
      const children = props.children;
      const domProps = { ...props };
      delete domProps.animate;
      delete domProps.exit;
      delete domProps.initial;
      delete domProps.transition;
      delete domProps.onAnimationComplete;
      delete domProps.children;
      const onAnimationEnd: AnimationEventHandler<HTMLElement> | undefined =
        onAnimationComplete ? () => onAnimationComplete() : undefined;
      const onClick =
        onAnimationComplete && !domProps.onClick
          ? () => onAnimationComplete()
          : domProps.onClick;

      return react.createElement(
        tag,
        {
          ...domProps,
          ref,
          onAnimationEnd,
          onClick,
          "data-motion-animate": animate
            ? JSON.stringify(animate)
            : undefined,
          "data-motion-initial": initial
            ? JSON.stringify(initial)
            : undefined,
          "data-motion-transition": transition
            ? JSON.stringify(transition)
            : undefined,
        },
        children
      );
    });

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
      article: makeMotionElement("article"),
      button: makeMotionElement("button"),
      div: makeMotionElement("div"),
      span: makeMotionElement("span"),
    },
    useReducedMotion: () => false,
  };
});

const GREY_REVEAL_FILTER =
  "grayscale(1) saturate(0) brightness(0.68) contrast(1.14)";
const FULL_COLOR_REVEAL_FILTER =
  "grayscale(0) saturate(1) brightness(1) contrast(1)";
const SETTLED_FULL_COLOR_FILTER = "none";

describe("Badge reveal experience", () => {
  let destinationRect: DOMRect;
  let destinationRectReads: number;
  let sourceRect: DOMRect;

  beforeEach(() => {
    vi.useFakeTimers();
    setViewport(1024, 768);
    destinationRect = createRect(80, 120, 160, 160);
    destinationRectReads = 0;
    sourceRect = createRect(320, 180, 224, 224);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-badge-reveal-destination")) {
          destinationRectReads += 1;
          return destinationRect;
        }

        if (this.getAttribute("data-testid") === "badge-reveal-artwork-anchor") {
          return sourceRect;
        }

        return createRect(0, 0, 100, 100);
      }
    );
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses a reduced-motion colour transformation before transfer and acknowledgement", async () => {
    const fixture = buildRevealFixture("first-victory", "award-first-victory");
    const acknowledge = vi.fn(async () => ({
      status: "success" as const,
      code: "acknowledged" as const,
    }));

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );

    const destination = document.querySelector<HTMLButtonElement>(
      'button[data-badge-slug="first-victory"]'
    ) as HTMLButtonElement;
    const destinationArtwork = destination.querySelector("img") as HTMLImageElement;

    expect(destination).toHaveAttribute(
      "data-badge-presentation",
      "unrevealed"
    );
    expect(destinationArtwork).toHaveClass("grayscale");
    expect(
      screen.getByRole("dialog").closest("[data-motion]")
    ).toHaveAttribute("data-motion", "reduced");
    const introHero = screen.getByTestId("badge-reveal-artwork-anchor");
    expect(introHero).toHaveAttribute("data-badge-reveal-color", "grey");
    expect(readMotionValue(introHero, "data-motion-initial").filter).toBe(
      GREY_REVEAL_FILTER
    );

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("dialog").closest("[data-reveal-phase]")).toHaveAttribute(
      "data-reveal-phase",
      "ready"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    expect(
      document.querySelector('[data-badge-reveal-cinematic="rotating"]')
    ).not.toBeInTheDocument();
    const colorizing = document.querySelector<HTMLElement>(
      '[data-badge-reveal-cinematic="colorizing"]'
    );
    const colorizingRotor = colorizing?.querySelector<HTMLElement>(
      '[data-badge-reveal-rotor="colorizing"]'
    );
    const colorizingArtwork = colorizing?.querySelector<HTMLElement>(
      '[data-badge-reveal-artwork-state="colorizing"]'
    );
    expect(colorizing).toBeInTheDocument();
    expect(readMotionValue(colorizingRotor, "data-motion-animate").rotateY).toBe(
      0
    );
    expect(readMotionValue(colorizingArtwork, "data-motion-initial").filter).toBe(
      GREY_REVEAL_FILTER
    );
    expect(readMotionValue(colorizingArtwork, "data-motion-animate").filter).toBe(
      FULL_COLOR_REVEAL_FILTER
    );
    expect(readMotionValue(colorizingArtwork, "data-motion-transition")).toMatchObject({
      duration: 0.8,
      ease: "easeInOut",
    });
    expect(acknowledge).not.toHaveBeenCalled();

    fireEvent.click(colorizingArtwork as HTMLElement);
    expect(
      document.querySelector('[data-badge-reveal-cinematic="colorHold"]')
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(699));
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));

    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );
    expect(transfer).toBeInTheDocument();
    expect(transfer).toHaveAttribute("data-transfer-motion", "fade");
    expect(JSON.parse(transfer?.getAttribute("data-motion-animate") ?? "{}"))
      .toMatchObject({
        left: (window.innerWidth - sourceRect.width) / 2,
        top: (window.innerHeight - sourceRect.height) / 2,
        width: 224,
        height: 224,
      });
    expect(readMotionValue(transfer, "data-motion-transition")).toMatchObject({
      duration: 0.2,
    });
    expect(acknowledge).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(transfer as HTMLElement);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith("award-first-victory");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(destination).toHaveAttribute("data-badge-presentation", "earned");
    expect(destinationArtwork).not.toHaveClass("grayscale");
  });

  it("runs grey rotation, separate colourization, hero hold, and measured lock-in in order", async () => {
    const fixture = buildRevealFixture("first-victory", "award-cinematic");
    const acknowledge = vi.fn(async () => ({
      status: "success" as const,
      code: "acknowledged" as const,
    }));

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
      />
    );

    const overlay = screen.getByRole("dialog").closest("[data-reveal-phase]");
    const introHero = screen.getByTestId("badge-reveal-artwork-anchor");
    const continueButton = screen.getByRole("button", {
      name: "Complete reveal",
    });

    expect(overlay).toHaveAttribute("data-reveal-phase", "intro");
    expect(introHero).toHaveAttribute("data-badge-reveal-color", "grey");
    expect(continueButton).toBeDisabled();
    expect(document.querySelector("[data-badge-reveal-cinematic]")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(599));
    expect(overlay).toHaveAttribute("data-reveal-phase", "intro");
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-reveal-phase", "ready");
    expect(screen.getByTestId("badge-reveal-artwork-anchor")).toHaveAttribute(
      "data-badge-reveal-color",
      "grey"
    );
    expect(continueButton).toBeEnabled();

    fireEvent.click(
      continueButton
    );

    const rotation = document.querySelector<HTMLElement>(
      '[data-badge-reveal-cinematic="rotating"]'
    );
    const rotationRotor = rotation?.querySelector<HTMLElement>(
      '[data-badge-reveal-rotor="rotating"]'
    );
    const rotationArtwork = rotationRotor?.querySelector<HTMLElement>(
      '[data-badge-reveal-artwork-state="rotating"]'
    );
    const sceneInitial = readMotionValue(rotation, "data-motion-initial");
    const sceneAnimation = readMotionValue(rotation, "data-motion-animate");
    const rotationAnimation = readMotionValue(
      rotationRotor,
      "data-motion-animate"
    );
    const rotationTransition = readMotionValue(
      rotationRotor,
      "data-motion-transition"
    );

    expect(overlay).toHaveAttribute("data-reveal-phase", "rotating");
    expect(rotation).toBeInTheDocument();
    expect(rotation).toHaveAttribute("data-badge-reveal-path", "centered");
    expect(sceneAnimation.left).toBe(sceneInitial.left);
    expect(sceneAnimation.top).toBe(sceneInitial.top);
    expect(Array.isArray(sceneAnimation.left)).toBe(false);
    expect(Array.isArray(sceneAnimation.top)).toBe(false);
    const rotationAngles = rotationAnimation.rotateY as number[];
    const finalRotationAngle = rotationAngles.at(-1)!;
    expect(rotationAngles[0]).toBe(0);
    expect(finalRotationAngle).toBeGreaterThanOrEqual(720);
    expect(finalRotationAngle % 360).toBe(0);
    expect(rotationTransition.duration).toBeGreaterThanOrEqual(3.5);
    expect(rotationTransition.duration).toBeLessThanOrEqual(4.5);
    expect(rotationTransition.ease).not.toBe("linear");
    expect(Array.isArray(rotationTransition.ease)).toBe(true);
    expect(rotation?.querySelectorAll("img").length).toBeGreaterThan(1);
    expect(
      rotation?.querySelector('[data-badge-reveal-depth-layer="edge"]')
    ).toBeInTheDocument();
    expect(rotationArtwork).toHaveAttribute("data-badge-reveal-color", "grey");
    expect(readMotionValue(rotationArtwork, "data-motion-animate").filter).toBe(
      GREY_REVEAL_FILTER
    );
    expect(destinationRectReads).toBe(1);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();

    fireEvent.click(rotationRotor as HTMLElement);
    const colorizing = document.querySelector<HTMLElement>(
      '[data-badge-reveal-cinematic="colorizing"]'
    );
    const colorizingRotor = colorizing?.querySelector<HTMLElement>(
      '[data-badge-reveal-rotor="colorizing"]'
    );
    const colorizingArtwork = colorizing?.querySelector<HTMLElement>(
      '[data-badge-reveal-artwork-state="colorizing"]'
    );
    expect(overlay).toHaveAttribute("data-reveal-phase", "colorizing");
    expect(readMotionValue(colorizingRotor, "data-motion-animate")).toMatchObject({
      rotateY: 720,
    });
    expect(colorizingArtwork).toHaveAttribute(
      "data-badge-reveal-color",
      "transitioning"
    );
    expect(readMotionValue(colorizingArtwork, "data-motion-initial").filter).toBe(
      GREY_REVEAL_FILTER
    );
    expect(readMotionValue(colorizingArtwork, "data-motion-animate").filter).toBe(
      FULL_COLOR_REVEAL_FILTER
    );
    expect(readMotionValue(colorizingArtwork, "data-motion-transition")).toMatchObject({
      duration: 0.8,
      ease: "easeInOut",
    });
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();

    fireEvent.click(colorizingArtwork as HTMLElement);
    const colorHold = document.querySelector<HTMLElement>(
      '[data-badge-reveal-cinematic="colorHold"]'
    );
    expect(overlay).toHaveAttribute("data-reveal-phase", "colorHold");
    expect(colorHold).toBeInTheDocument();
    expect(
      colorHold?.querySelector('[data-badge-reveal-color="full"]')
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(699));
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();

    destinationRect = createRect(44, 148, 136, 136);
    act(() => vi.advanceTimersByTime(1));

    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );
    const transferInitial = readMotionValue(
      transfer,
      "data-motion-initial"
    );
    const transferAnimation = readMotionValue(
      transfer,
      "data-motion-animate"
    );
    const transferRotor = transfer?.querySelector<HTMLElement>(
      '[data-badge-reveal-rotor="transferring"]'
    );
    const transferRotorAnimation = readMotionValue(
      transferRotor,
      "data-motion-animate"
    );
    const transferTransition = readMotionValue(
      transfer,
      "data-motion-transition"
    );

    expect(destinationRectReads).toBe(2);
    expect(transferInitial).toMatchObject({ scale: 1 });
    expect(transferAnimation).toMatchObject({
      left: 44,
      top: 148,
      width: 136,
      height: 136,
      scale: [1, 1.025, 0.995, 1],
    });
    expect(transferRotorAnimation.rotateY).toBe(720);
    expect(Array.isArray(transferRotorAnimation.rotateY)).toBe(false);
    expect(transferTransition).toMatchObject({ duration: 0.8 });
    expect(acknowledge).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(transfer as HTMLElement);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith("award-cinematic");
  });

  it("falls through interrupted completion callbacks on the cinematic timetable", () => {
    const fixture = buildRevealFixture("first-victory", "award-watchdog");
    const acknowledge = vi.fn();

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
      />
    );

    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    act(() => vi.advanceTimersByTime(4_099));
    expect(
      document.querySelector('[data-badge-reveal-cinematic="rotating"]')
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(
      document.querySelector('[data-badge-reveal-cinematic="colorizing"]')
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(899));
    expect(
      document.querySelector('[data-badge-reveal-cinematic="colorizing"]')
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(
      document.querySelector('[data-badge-reveal-cinematic="colorHold"]')
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(699));
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(
      document.querySelector('[data-badge-transfer="measured"]')
    ).toBeInTheDocument();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("scrolls an offscreen registered slot into view before its final fresh measurement", async () => {
    destinationRect = createRect(80, 920, 160, 160);
    const fixture = buildRevealFixture("first-victory", "award-offscreen-slot");
    const acknowledge = vi.fn();

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
      />
    );

    const destination = document.querySelector<HTMLElement>(
      '[data-badge-reveal-destination="true"]'
    ) as HTMLElement;
    const scrollIntoView = vi.fn(() => {
      destinationRect = createRect(76, 304, 148, 148);
    });
    Object.defineProperty(destination, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );
    const rotation = document.querySelector<HTMLElement>(
      '[data-badge-reveal-cinematic="rotating"]'
    );
    const rotationRotor = rotation?.querySelector<HTMLElement>(
      '[data-badge-reveal-rotor="rotating"]'
    );

    fireEvent.click(rotationRotor as HTMLElement);
    const colorizingArtwork = document.querySelector<HTMLElement>(
      '[data-badge-reveal-artwork-state="colorizing"]'
    );
    fireEvent.click(colorizingArtwork as HTMLElement);

    await act(async () => {
      vi.advanceTimersByTime(740);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
    expect(destinationRectReads).toBe(3);

    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );
    expect(readMotionValue(transfer, "data-motion-animate")).toMatchObject({
      left: 76,
      top: 304,
      width: 148,
      height: 148,
    });
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("retains bounded fallback transfer geometry when no destination is mounted", () => {
    const fixture = buildRevealFixture("first-victory", "award-fallback-slot");
    const acknowledge = vi.fn();

    render(
      <BadgeRevealOverlay
        item={fixture.queueItem.item}
        onContinue={acknowledge}
        getDestinationRect={() => null}
        reducedMotion
      />
    );

    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );
    const colorizingArtwork = document.querySelector<HTMLElement>(
      '[data-badge-reveal-artwork-state="colorizing"]'
    );
    fireEvent.click(colorizingArtwork as HTMLElement);
    act(() => vi.advanceTimersByTime(700));

    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="fallback"]'
    );
    expect(transfer).toBeInTheDocument();
    expect(readMotionValue(transfer, "data-motion-animate")).toMatchObject({
      left: (window.innerWidth - sourceRect.width) / 2,
      top: (window.innerHeight - sourceRect.height) / 2,
      width: sourceRect.width,
      height: sourceRect.height,
    });
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("keeps a focusable busy dialog mounted throughout the cinematic and transfer", () => {
    const fixture = buildRevealFixture("first-victory", "award-focus-shell");
    const acknowledge = vi.fn();
    const view = render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
      />
    );

    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );
    act(() => vi.advanceTimersByTime(1));

    const orbitDialog = screen.getByRole("dialog", {
      name: "First Victory",
    });
    expect(orbitDialog).toHaveAttribute("aria-busy", "true");
    expect(orbitDialog).toHaveAttribute(
      "data-badge-reveal-progress",
      "rotating"
    );
    expect(orbitDialog).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Badge unlocked");
    expect(view.container).toHaveAttribute("aria-hidden", "true");
    expect(view.container.inert).toBe(true);

    const rotation = document.querySelector<HTMLElement>(
      '[data-badge-reveal-cinematic="rotating"]'
    );
    const rotationRotor = rotation?.querySelector<HTMLElement>(
      '[data-badge-reveal-rotor="rotating"]'
    );
    fireEvent.click(rotationRotor as HTMLElement);
    const colorizingArtwork = document.querySelector<HTMLElement>(
      '[data-badge-reveal-artwork-state="colorizing"]'
    );
    fireEvent.click(colorizingArtwork as HTMLElement);
    act(() => vi.advanceTimersByTime(700));
    act(() => vi.advanceTimersByTime(1));

    const transferDialog = screen.getByRole("dialog", {
      name: "First Victory",
    });
    expect(transferDialog).toHaveAttribute(
      "data-badge-reveal-progress",
      "transferring"
    );
    expect(transferDialog).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(transferDialog).toHaveFocus();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("keeps the mobile rotation fixed inside a compact viewport envelope", () => {
    setViewport(390, 844);
    sourceRect = createRect(83, 180, 224, 224);
    const fixture = buildRevealFixture("first-victory", "award-mobile");

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={vi.fn()}
      />
    );

    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    const scene = document.querySelector<HTMLElement>(
      '[data-badge-reveal-path="centered"]'
    );
    const initial = readMotionValue(scene, "data-motion-initial");
    const animation = readMotionValue(scene, "data-motion-animate");
    const left = animation.left as number;
    const top = animation.top as number;

    expect(scene).toBeInTheDocument();
    expect(Array.isArray(left)).toBe(false);
    expect(Array.isArray(top)).toBe(false);
    expect(left).toBe(initial.left);
    expect(top).toBe(initial.top);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + sourceRect.width).toBeLessThanOrEqual(390);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + sourceRect.height).toBeLessThanOrEqual(844);
  });

  it("normalizes a clipped mobile source before the fixed rotation", () => {
    setViewport(390, 844);
    sourceRect = createRect(83, -96, 224, 224);
    const fixture = buildRevealFixture("first-victory", "award-clipped-source");

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={vi.fn()}
      />
    );

    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    const scene = document.querySelector<HTMLElement>(
      '[data-badge-reveal-path="centered"]'
    );
    const initial = readMotionValue(scene, "data-motion-initial");
    const animation = readMotionValue(scene, "data-motion-animate");
    const top = animation.top as number;

    expect(initial.top).toBeGreaterThanOrEqual(18);
    expect(Array.isArray(top)).toBe(false);
    expect(top).toBe(initial.top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + sourceRect.height).toBeLessThanOrEqual(844);
  });

  it("mounts the reveal portal after hydration without a server/client mismatch", async () => {
    const fixture = buildRevealFixture("first-victory", "award-hydration");
    const acknowledge = vi.fn(async () => ({
      status: "success" as const,
      code: "acknowledged" as const,
    }));
    const element = (
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );
    const serverMarkup = renderToString(element);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const root = hydrateRoot(container, element);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "Hydration failed"
    );
    expect(
      screen.getByRole("dialog", { name: "First Victory" })
    ).toBeInTheDocument();

    root.unmount();
    container.remove();
  });

  it("keeps an accessible saving surface visible until acknowledgement resolves", async () => {
    const fixture = buildRevealFixture("first-victory", "award-slow-save");
    let resolveAcknowledgement: ((value: {
      status: "success";
      code: "acknowledged";
    }) => void) | null = null;
    const acknowledge = vi.fn(
      () =>
        new Promise<{
          status: "success";
          code: "acknowledged";
        }>((resolve) => {
          resolveAcknowledgement = resolve;
        })
    );

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );

    act(() => vi.advanceTimersByTime(20));
    expect(
      screen.getByRole("dialog", { name: "First Victory" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toHaveFocus();

    const transfer = advanceCurrentRevealToTransfer();

    await act(async () => {
      fireEvent.click(transfer as HTMLElement);
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(1));

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saving reveal");
    expect(
      document.querySelector('[data-transfer-state="saving"]')
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "First Victory" })
    ).toHaveFocus();
    expect(
      document.querySelector('button[data-badge-slug="first-victory"]')
    ).toHaveAttribute("data-badge-presentation", "unrevealed");

    await act(async () => {
      resolveAcknowledgement?.({
        status: "success",
        code: "acknowledged",
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a failed acknowledgement pending and retries only that award", async () => {
    const fixture = buildRevealFixture("first-victory", "award-retry");
    const acknowledge = vi
      .fn()
      .mockResolvedValueOnce({
        status: "error" as const,
        code: "acknowledge-failed" as const,
        message: "Reveal acknowledgement failed safely.",
      })
      .mockResolvedValueOnce({
        status: "success" as const,
        code: "acknowledged" as const,
      });

    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );

    await completeCurrentReveal();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your Badge reveal was not saved. Check your connection and retry."
    );
    expect(
      screen.getByRole("button", { name: "Retry acknowledgement" })
    ).toBeEnabled();
    const failedHero = screen.getByTestId("badge-reveal-artwork-anchor");
    expect(failedHero).toHaveAttribute("data-badge-reveal-color", "full");
    expect(readMotionValue(failedHero, "data-motion-animate").filter).toBe(
      SETTLED_FULL_COLOR_FILTER
    );
    expect(readMotionValue(failedHero, "data-motion-initial").filter).toBe(
      SETTLED_FULL_COLOR_FILTER
    );
    expect(readMotionValue(failedHero, "data-motion-transition")).toMatchObject({
      duration: 0,
    });
    expect(failedHero.querySelector("img")).not.toHaveClass("grayscale");
    expect(
      document.querySelector('button[data-badge-slug="first-victory"]')
    ).toHaveAttribute("data-badge-presentation", "unrevealed");
    expect(
      document.querySelector("[data-badge-reveal-cinematic]")
    ).not.toBeInTheDocument();
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry acknowledgement" })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acknowledge).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-badge-transfer]")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reveals multiple awards in deterministic timestamp order", async () => {
    const first = buildRevealFixture("first-victory", "award-later", {
      queuedAt: "2026-08-20T12:00:00.000Z",
    });
    const second = buildRevealFixture("first-deployment", "award-earlier", {
      queuedAt: "2026-08-19T12:00:00.000Z",
    });
    const acknowledge = vi.fn(async () => ({
      status: "success" as const,
      code: "acknowledged" as const,
    }));
    const badgeData = buildDashboardBadgeData({
      awards: [first.award, second.award],
    });

    render(
      <DashboardBadgesSection
        badgeData={badgeData}
        pendingReveals={[first.queueItem, second.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("First Deployment");
    await completeCurrentReveal();
    expect(acknowledge).toHaveBeenNthCalledWith(1, "award-earlier");

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");
    await completeCurrentReveal();
    expect(acknowledge).toHaveBeenNthCalledWith(2, "award-later");
  });

  it("treats Not now and Escape as local dismissal without acknowledgement", () => {
    const fixture = buildRevealFixture("first-victory", "award-dismiss");
    const acknowledge = vi.fn();
    const view = render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(acknowledge).not.toHaveBeenCalled();

    view.unmount();
    render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
        reducedMotion
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("renders a safe error boundary instead of a false zero-of-thirty state", () => {
    render(
      <DashboardBadgesSection
        badgeData={null}
        revealLoadError="Reveal state could not be verified."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reveal state could not be verified."
    );
    expect(screen.queryByText(/0.*30/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

async function completeCurrentReveal() {
  const transfer = advanceCurrentRevealToTransfer();

  await act(async () => {
    fireEvent.click(transfer as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function advanceCurrentRevealToTransfer() {
  act(() => vi.advanceTimersByTime(600));
  fireEvent.click(
    screen.getByRole("button", { name: /reveal|acknowledgement/i })
  );

  const rotation = document.querySelector<HTMLElement>(
    '[data-badge-reveal-cinematic="rotating"]'
  );
  if (rotation) {
    fireEvent.click(
      rotation.querySelector<HTMLElement>(
        '[data-badge-reveal-rotor="rotating"]'
      ) as HTMLElement
    );
  }

  const colorizingArtwork = document.querySelector<HTMLElement>(
    '[data-badge-reveal-artwork-state="colorizing"]'
  );
  fireEvent.click(colorizingArtwork as HTMLElement);
  act(() => vi.advanceTimersByTime(700));

  return document.querySelector<HTMLElement>(
    '[data-badge-transfer="measured"]'
  );
}

function readMotionValue(
  element: HTMLElement | null | undefined,
  attribute: string
) {
  return JSON.parse(element?.getAttribute(attribute) ?? "{}") as Record<
    string,
    unknown
  >;
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function buildRevealFixture(
  badgeSlug: PlayerBadgeAward["badgeSlug"],
  awardId: string,
  { queuedAt = "2026-08-19T12:00:00.000Z" }: { queuedAt?: string } = {}
) {
  const award: PlayerBadgeAward = {
    badgeSlug,
    awardId,
    awardedAt: queuedAt,
    originalAwardedAt: queuedAt,
    isUnrevealed: true,
  };
  const badgeData = buildDashboardBadgeData({ awards: [award] });
  const item = badgeData.collection.items.find(
    (candidate) => candidate.definition.slug === badgeSlug
  );

  if (!item || item.state !== "earned") {
    throw new Error(`Missing earned Badge fixture for ${badgeSlug}.`);
  }

  const queueItem: BadgeRevealQueueItem = {
    id: awardId,
    item: item as EarnedBadgeCollectionItem,
    queuedAt,
    reason: "new-unlock",
    entitlement: { premiumEffectsEnabled: false },
    seenAt: null,
  };

  return { award, badgeData, queueItem };
}

function createRect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}
