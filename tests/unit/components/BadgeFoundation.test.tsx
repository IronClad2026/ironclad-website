// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeGrid from "@/components/badges/BadgeGrid";
import BadgeQueue from "@/components/badges/BadgeQueue";
import BadgeRevealOverlay from "@/components/badges/BadgeRevealOverlay";
import BadgeSlot from "@/components/badges/BadgeSlot";
import Phase10PreviewPanel from "@/components/badges/Phase10PreviewPanel";
import {
  mockEarnedBadge,
  mockFreeBadgeEntitlement,
  mockFreePlayerBadgeCollection,
  mockLockedBadge,
  mockNewUnlockQueued,
  mockPremiumBadgeEntitlement,
  mockRetroactivePremiumRevealPending,
} from "@/lib/badges/fixtures";

type MockImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  unoptimized?: boolean;
};

vi.mock("next/image", async () => {
  const react = await vi.importActual<typeof import("react")>("react");

  return {
    default: (props: MockImageProps) => {
      const imageProps = { ...props };
      delete imageProps.unoptimized;

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
  };
  const stripMotionProps = (props: MotionMockProps) => {
    const domProps = { ...props };
    delete domProps.animate;
    delete domProps.exit;
    delete domProps.initial;
    delete domProps.transition;

    return domProps;
  };

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
      article: ({ children, ...props }: MotionMockProps) =>
        react.createElement("article", stripMotionProps(props), children),
      button: ({ children, ...props }: MotionMockProps) =>
        react.createElement("button", stripMotionProps(props), children),
      span: ({ children, ...props }: MotionMockProps) =>
        react.createElement("span", stripMotionProps(props), children),
    },
    useReducedMotion: () => false,
  };
});

describe("badge foundation components", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders all 30 BadgeGrid slots in canonical order", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    const slots = screen.getAllByRole("listitem");
    expect(slots).toHaveLength(30);
    expect(screen.getByText("2/30 earned")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /IronClad Recruit/i })[0]
    ).toHaveAttribute("data-badge-slug", "ironclad-recruit");
  });

  it("renders locked and earned BadgeSlot states", () => {
    render(
      <div>
        <BadgeSlot item={mockEarnedBadge} />
        <BadgeSlot item={mockLockedBadge} />
      </div>
    );

    expect(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    ).toHaveAttribute("data-badge-state", "earned");
    expect(
      screen.getByRole("button", {
        name: "First Deployment, Common, locked",
      })
    ).toHaveAttribute("data-badge-state", "locked");
  });

  it("closes BadgeDetailModal with Escape", () => {
    const onClose = vi.fn();

    render(<BadgeDetailModal item={mockEarnedBadge} onClose={onClose} />);

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByRole("dialog")).toHaveTextContent("Badge 01");
    expect(screen.getByRole("dialog")).toHaveTextContent("Original awarded");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders the reduced-motion BadgeRevealOverlay fallback", () => {
    render(
      <BadgeRevealOverlay
        item={mockEarnedBadge}
        entitlement={mockPremiumBadgeEntitlement}
        onClose={vi.fn()}
        reducedMotion
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Premium badge reveal"
    );
    expect(screen.getByRole("dialog").closest("[data-motion]")).toHaveAttribute(
      "data-motion",
      "reduced"
    );
    expect(screen.queryByTestId("badge-reveal-asset-fallback")).not.toBeInTheDocument();
  });

  it("processes BadgeQueue items sequentially", async () => {
    const onItemSeen = vi.fn();

    render(
      <BadgeQueue
        items={[mockRetroactivePremiumRevealPending, mockNewUnlockQueued]}
        onItemSeen={onItemSeen}
        reducedMotion
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("Elite Champion");
    expect(screen.queryByText("First Victory")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Close badge reveal" })[0]
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");
    });
    expect(onItemSeen).toHaveBeenCalledWith(
      mockRetroactivePremiumRevealPending
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Close badge reveal" })[0]
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onItemSeen).toHaveBeenCalledWith(mockNewUnlockQueued);
    expect(onItemSeen).toHaveBeenCalledTimes(2);
  });

  it("keeps missing image assets from breaking BadgeSlot rendering", () => {
    render(<BadgeSlot item={mockEarnedBadge} />);

    fireEvent.error(
      screen.getByRole("img", {
        name: "IronClad Recruit badge artwork",
      })
    );

    expect(screen.getByTestId("badge-asset-fallback")).toHaveTextContent("01");
    expect(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    ).toBeInTheDocument();
  });

  it("renders the Phase 10 preview controls without production data hooks", () => {
    render(<Phase10PreviewPanel />);

    expect(screen.getByText("30 / 30 badge slots")).toBeInTheDocument();
    expect(screen.getByText("Rarity coverage")).toBeInTheDocument();
    expect(screen.getByText("Phase 10 pilot badges")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    expect(
      screen.getByRole("button", { name: "Free reveal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Premium reveal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Multi-badge queue" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reduced motion" })
    ).toBeInTheDocument();
  });

  it("opens a reduced-motion reveal from the Phase 10 preview lab", () => {
    render(<Phase10PreviewPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Reduced motion" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");
    expect(screen.getByRole("dialog").closest("[data-motion]")).toHaveAttribute(
      "data-motion",
      "reduced"
    );
  });
});
