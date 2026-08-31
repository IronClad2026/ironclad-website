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
      const onAnimationComplete = props.onAnimationComplete;
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-badge-reveal-destination")) {
          return createRect(80, 120, 160, 160);
        }

        if (this.getAttribute("data-testid") === "badge-reveal-artwork-anchor") {
          return createRect(320, 180, 224, 224);
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
  act(() => vi.advanceTimersByTime(200));
  fireEvent.click(screen.getByRole("button", { name: /reveal|acknowledgement/i }));
  const transfer = document.querySelector<HTMLElement>(
    '[data-badge-transfer="measured"]'
  );

  await act(async () => {
    fireEvent.click(transfer as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();
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
