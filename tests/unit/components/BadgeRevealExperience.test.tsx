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

  it("keeps an owned pending Badge grey until measured transfer and acknowledgement complete", async () => {
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

    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );
    expect(transfer).toBeInTheDocument();
    expect(transfer).toHaveAttribute("data-transfer-motion", "fade");
    expect(JSON.parse(transfer?.getAttribute("data-motion-animate") ?? "{}"))
      .toMatchObject({
        left: 320,
        top: 180,
        width: 224,
        height: 224,
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

  it("runs a deliberate orbit, remeasures the live slot, and acknowledges only after lock-in", async () => {
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

    act(() => vi.advanceTimersByTime(520));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    const orbit = document.querySelector<HTMLElement>(
      '[data-badge-reveal-orbit="wide"]'
    );
    const orbitAnimation = readMotionValue(orbit, "data-motion-animate");
    const orbitTransition = readMotionValue(
      orbit,
      "data-motion-transition"
    );

    expect(orbit).toBeInTheDocument();
    expect(orbitAnimation.rotateY).toEqual([0, 260, 520, 760, 900]);
    expect(orbitAnimation.rotateZ).toEqual([0, -2.2, 2.7, -1.3, -0.4]);
    expect(orbitAnimation.scale).toEqual([1, 1.08, 1.12, 1.04, 0.98]);
    expect(orbitTransition).toMatchObject({
      duration: 1.9,
      times: [0, 0.22, 0.5, 0.74, 1],
    });
    expect(orbit?.querySelectorAll("img")).toHaveLength(2);
    expect(destinationRectReads).toBe(1);
    expect(acknowledge).not.toHaveBeenCalled();

    destinationRect = createRect(44, 148, 136, 136);
    fireEvent.click(orbit as HTMLElement);

    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );
    const transferAnimation = readMotionValue(
      transfer,
      "data-motion-animate"
    );
    const transferTransition = readMotionValue(
      transfer,
      "data-motion-transition"
    );

    expect(destinationRectReads).toBe(2);
    expect(transferAnimation).toMatchObject({
      left: 44,
      top: 148,
      width: 136,
      height: 136,
      rotateY: [900, 990, 1050, 1080],
    });
    expect(transferTransition).toMatchObject({ duration: 0.72 });
    expect(acknowledge).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(transfer as HTMLElement);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith("award-cinematic");
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

    act(() => vi.advanceTimersByTime(520));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );
    const orbit = document.querySelector<HTMLElement>(
      "[data-badge-reveal-orbit]"
    );

    await act(async () => {
      fireEvent.click(orbit as HTMLElement);
      vi.advanceTimersByTime(40);
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

  it("keeps a focusable busy dialog mounted during orbit and transfer", () => {
    const fixture = buildRevealFixture("first-victory", "award-focus-shell");
    const acknowledge = vi.fn();
    const view = render(
      <DashboardBadgesSection
        badgeData={fixture.badgeData}
        pendingReveals={[fixture.queueItem]}
        acknowledgeRevealAction={acknowledge}
      />
    );

    act(() => vi.advanceTimersByTime(520));
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
      "orbiting"
    );
    expect(orbitDialog).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Badge unlocked");
    expect(view.container).toHaveAttribute("aria-hidden", "true");
    expect(view.container.inert).toBe(true);

    const orbit = document.querySelector<HTMLElement>(
      "[data-badge-reveal-orbit]"
    );
    fireEvent.click(orbit as HTMLElement);
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

  it("keeps the mobile orbit inside a compact viewport envelope", () => {
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

    act(() => vi.advanceTimersByTime(520));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    const orbit = document.querySelector<HTMLElement>(
      '[data-badge-reveal-orbit="compact"]'
    );
    const animation = readMotionValue(orbit, "data-motion-animate");
    const left = animation.left as number[];
    const top = animation.top as number[];

    expect(orbit).toBeInTheDocument();
    expect(animation.scale).toEqual([1, 1.04, 1.06, 1.025, 0.98]);
    expect(left.every((value) => Math.abs(value - sourceRect.left) <= 44))
      .toBe(true);
    expect(top.every((value) => Math.abs(value - sourceRect.top) <= 56))
      .toBe(true);
    expect(Math.min(...left)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...left) + sourceRect.width).toBeLessThanOrEqual(390);
    expect(Math.min(...top)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...top) + sourceRect.height).toBeLessThanOrEqual(844);
  });

  it("normalizes a clipped mobile source before the first orbit frame", () => {
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

    act(() => vi.advanceTimersByTime(520));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );

    const orbit = document.querySelector<HTMLElement>(
      '[data-badge-reveal-orbit="compact"]'
    );
    const initial = readMotionValue(orbit, "data-motion-initial");
    const animation = readMotionValue(orbit, "data-motion-animate");
    const top = animation.top as number[];

    expect(initial.top).toBeGreaterThanOrEqual(18);
    expect(top[0]).toBe(initial.top);
    expect(top.every((value) => value >= 0)).toBe(true);
    expect(Math.max(...top) + sourceRect.height).toBeLessThanOrEqual(844);
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

    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete reveal" })
    );
    const transfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );

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
    expect(
      document.querySelector('button[data-badge-slug="first-victory"]')
    ).toHaveAttribute("data-badge-presentation", "unrevealed");

    fireEvent.click(
      screen.getByRole("button", { name: "Retry acknowledgement" })
    );
    const retryTransfer = document.querySelector<HTMLElement>(
      '[data-badge-transfer="measured"]'
    );

    await act(async () => {
      fireEvent.click(retryTransfer as HTMLElement);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acknowledge).toHaveBeenCalledTimes(2);
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
  act(() => vi.advanceTimersByTime(520));
  fireEvent.click(screen.getByRole("button", { name: /reveal|acknowledgement/i }));
  const orbit = document.querySelector<HTMLElement>(
    "[data-badge-reveal-orbit]"
  );

  if (orbit) {
    fireEvent.click(orbit);
  }

  const transfer = document.querySelector<HTMLElement>(
    '[data-badge-transfer="measured"]'
  );

  await act(async () => {
    fireEvent.click(transfer as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function readMotionValue(element: HTMLElement | null, attribute: string) {
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
