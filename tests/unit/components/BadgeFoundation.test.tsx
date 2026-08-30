// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  useState,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
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
import { mapBadgeCollection } from "@/lib/badges/presentation";

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
      div: ({ children, ...props }: MotionMockProps) =>
        react.createElement("div", stripMotionProps(props), children),
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

  it("keeps the BadgeGrid responsive column classes bounded", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    const grid = screen.getByRole("list", {
      name: "IronClad badge collection slots",
    });

    expect(grid).toHaveClass("grid-cols-2");
    expect(grid).toHaveClass("md:grid-cols-3");
    expect(grid).toHaveClass("lg:grid-cols-4");
    expect(grid).toHaveClass("xl:grid-cols-5");
    expect(grid).toHaveClass("2xl:grid-cols-6");
    expect(grid.className).not.toContain("grid-cols-10");
  });

  it("opens BadgeDetailModal when clicking an earned badge card", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByRole("dialog")).toHaveTextContent("Earned");
  });

  it("opens BadgeDetailModal when clicking badge artwork", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    fireEvent.click(
      screen.getByRole("img", {
        name: "IronClad Recruit badge artwork",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
  });

  it("forwards BadgeGrid selection when an external selection handler is provided", () => {
    const onSelect = vi.fn();

    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
        onSelect={onSelect}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    );

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "earned",
        definition: expect.objectContaining({ slug: "ironclad-recruit" }),
      })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens BadgeDetailModal for locked badges", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "First Deployment, Common, locked",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("First Deployment");
    expect(screen.getByRole("dialog")).toHaveTextContent("Locked");
  });

  it("opens BadgeDetailModal with Enter", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      }),
      { key: "Enter" }
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
  });

  it("opens BadgeDetailModal with Space", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      }),
      { key: " " }
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
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

  it("renders earned BadgeSlot artwork when available", () => {
    render(<BadgeSlot item={mockEarnedBadge} />);

    const button = screen.getByRole("button", {
      name: "IronClad Recruit, Common, earned",
    });
    const image = within(button).getByRole("img", {
      name: "IronClad Recruit badge artwork",
    });
    const artworkFrame = image.closest("[data-badge-artwork]");

    expect(image).toHaveAttribute("src", "/assets/badges/1.png");
    expect(image).toHaveStyle({
      transform: "scale(1)",
      transformOrigin: "center",
    });
    expect(image).toHaveClass("object-contain");
    expect(image).not.toHaveClass("mix-blend-multiply");
    expect(image.className).not.toContain("bg-white");
    expect(artworkFrame).toHaveAttribute(
      "data-badge-artwork",
      "real"
    );
    expect(artworkFrame).toHaveAttribute(
      "data-badge-artwork-surface",
      "card"
    );
    expect(artworkFrame).toHaveClass("pointer-events-none");
    expect(artworkFrame).toHaveClass("overflow-visible");
    expect(artworkFrame).not.toHaveClass("rounded-lg");
    expect(artworkFrame).not.toHaveClass("overflow-hidden");
    expect(artworkFrame?.className).not.toContain("bg-");
  });

  it("renders locked BadgeSlot artwork when available", () => {
    render(<BadgeSlot item={mockLockedBadge} />);

    const button = screen.getByRole("button", {
      name: "First Deployment, Common, locked",
    });
    const image = within(button).getByRole("img", {
      name: "First Deployment badge artwork",
    });
    const artworkFrame = image.closest("[data-badge-artwork]");

    expect(image).toHaveAttribute("src", "/assets/badges/2.png");
    expect(image).toHaveStyle({
      transform: "scale(1.03)",
      transformOrigin: "center",
    });
    expect(image).toHaveClass("grayscale");
    expect(image).toHaveClass("object-contain");
    expect(image).toHaveClass("opacity-[0.8]");
    expect(image).toHaveClass("brightness-[0.94]");
    expect(image).not.toHaveClass("brightness-[0.52]");
    expect(image).not.toHaveClass("mix-blend-multiply");
    expect(artworkFrame).toHaveAttribute("data-badge-artwork", "real");
    expect(artworkFrame?.className).not.toContain("bg-");
    expect(
      Array.from(artworkFrame?.querySelectorAll("span") ?? []).some((span) =>
        span.className.includes("bg-black/6")
      )
    ).toBe(false);
  });

  it("closes BadgeDetailModal with Escape", () => {
    const onClose = vi.fn();

    render(<BadgeDetailModal item={mockEarnedBadge} onClose={onClose} />);

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByRole("dialog")).toHaveTextContent("Badge 01");
    expect(screen.getByRole("dialog")).toHaveTextContent("Original awarded");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Complete identity and ELO verification"
    );
    expect(
      screen.getByRole("img", {
        name: "IronClad Recruit badge artwork",
      })
    ).toHaveAttribute("src", "/assets/badges/1.png");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders BadgeRevealOverlay artwork with reduced-motion fallback", () => {
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
    expect(
      screen.getByRole("img", {
        name: "IronClad Recruit badge artwork",
      })
    ).toHaveAttribute("src", "/assets/badges/1.png");
    expect(
      screen.queryByTestId("badge-artwork-fallback")
    ).not.toBeInTheDocument();
  });

  it("keeps Premium effects presentation-only in BadgeSlot", () => {
    render(
      <div>
        <BadgeSlot
          item={mockEarnedBadge}
          entitlement={mockPremiumBadgeEntitlement}
        />
        <BadgeSlot
          item={mockLockedBadge}
          entitlement={mockPremiumBadgeEntitlement}
        />
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
    expect(
      document.querySelectorAll('[data-premium-badge-effects="true"]')
    ).toHaveLength(1);
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

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");
    });
    expect(onItemSeen).toHaveBeenCalledWith(
      mockRetroactivePremiumRevealPending
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onItemSeen).toHaveBeenCalledWith(mockNewUnlockQueued);
    expect(onItemSeen).toHaveBeenCalledTimes(2);
  });

  it("renders no reveal overlay when the queue is empty", () => {
    render(<BadgeQueue items={[]} reducedMotion />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("acknowledges the current award before closing the final reveal", async () => {
    const acknowledgeItemAction = vi.fn(async () => ({
      status: "success" as const,
      code: "acknowledged" as const,
    }));

    render(
      <BadgeQueue
        items={[mockNewUnlockQueued]}
        acknowledgeItemAction={acknowledgeItemAction}
        reducedMotion
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(acknowledgeItemAction).toHaveBeenCalledWith(
        mockNewUnlockQueued.id
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps the current reveal open with a retryable error after failure", async () => {
    const acknowledgeItemAction = vi.fn(async () => ({
      status: "error" as const,
      code: "acknowledge-failed" as const,
      message: "Reveal save failed. Retry now.",
    }));

    render(
      <BadgeQueue
        items={[mockNewUnlockQueued]}
        acknowledgeItemAction={acknowledgeItemAction}
        reducedMotion
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reveal save failed. Retry now."
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(acknowledgeItemAction).toHaveBeenCalledTimes(1);
  });

  it("dismisses the queue on Escape without acknowledging", async () => {
    const acknowledgeItemAction = vi.fn();
    const onItemSeen = vi.fn();

    render(
      <BadgeQueue
        items={[mockNewUnlockQueued]}
        acknowledgeItemAction={acknowledgeItemAction}
        onItemSeen={onItemSeen}
        reducedMotion
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(acknowledgeItemAction).not.toHaveBeenCalled();
    expect(onItemSeen).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("temporarily dismisses the entire queue without revealing any badge", async () => {
    const acknowledgeItemAction = vi.fn();
    const onItemSeen = vi.fn();
    const queueItems = [
      mockRetroactivePremiumRevealPending,
      mockNewUnlockQueued,
    ];
    const view = render(
      <BadgeQueue
        items={queueItems}
        acknowledgeItemAction={acknowledgeItemAction}
        onItemSeen={onItemSeen}
        reducedMotion
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("Elite Champion");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(acknowledgeItemAction).not.toHaveBeenCalled();
    expect(onItemSeen).not.toHaveBeenCalled();

    view.rerender(
      <BadgeQueue
        items={queueItems}
        acknowledgeItemAction={acknowledgeItemAction}
        onItemSeen={onItemSeen}
        reducedMotion
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    view.unmount();
    render(
      <BadgeQueue
        items={queueItems}
        acknowledgeItemAction={acknowledgeItemAction}
        onItemSeen={onItemSeen}
        reducedMotion
      />
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Elite Champion");
    expect(screen.queryByText("First Victory")).not.toBeInTheDocument();
  });

  it("starts focus inside the modal and makes the background inert", () => {
    const { container } = render(
      <BadgeQueue items={[mockNewUnlockQueued]} reducedMotion />
    );

    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container.inert).toBe(true);
  });

  it("wraps Tab and Shift+Tab focus within the modal", () => {
    render(<BadgeQueue items={[mockNewUnlockQueued]} reducedMotion />);

    const continueButton = screen.getByRole("button", { name: "Continue" });
    const notNowButton = screen.getByRole("button", { name: "Not now" });

    notNowButton.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(continueButton).toHaveFocus();

    continueButton.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(notNowButton).toHaveFocus();
  });

  it("restores focus after a temporary dismissal", async () => {
    render(<BadgeRevealFocusRestoreFixture />);

    const openButton = screen.getByRole("button", { name: "Open reveal" });
    const backgroundRoot = openButton.parentElement;
    openButton.focus();
    fireEvent.click(openButton);

    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(openButton).toHaveFocus();
      expect(backgroundRoot).not.toHaveAttribute("aria-hidden");
      expect(backgroundRoot?.inert).not.toBe(true);
    });
  });

  it("keeps missing image assets from breaking BadgeSlot rendering", () => {
    render(<BadgeSlot item={mockEarnedBadge} />);

    fireEvent.error(
      screen.getByRole("img", {
        name: "IronClad Recruit badge artwork",
      })
    );

    expect(screen.getByTestId("badge-artwork-fallback")).toHaveTextContent("01");
    expect(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    ).toBeInTheDocument();
  });

  it("keeps missing image assets from breaking the reveal overlay", () => {
    render(
      <BadgeRevealOverlay
        item={mockEarnedBadge}
        onContinue={vi.fn()}
        reducedMotion
      />
    );

    fireEvent.error(
      screen.getByRole("img", {
        name: "IronClad Recruit badge artwork",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByTestId("badge-artwork-fallback")).toBeInTheDocument();
  });

  it("renders final artwork for a previously fallback-only badge", () => {
    const missingArtworkItem = requireItemByNumber(
      mapBadgeCollection({ awards: [] }),
      11
    );

    expect(() => render(<BadgeSlot item={missingArtworkItem} />)).not.toThrow();

    const button = screen.getByRole("button", {
      name: "Five Victories, Uncommon, locked",
    });
    const image = within(button).getByRole("img", {
      name: "Five Victories badge artwork",
    });
    const artworkFrame = image.closest("[data-badge-artwork]");

    expect(image).toHaveAttribute("src", "/assets/badges/11.png");
    expect(image).toHaveStyle({
      transform: "scale(1.06)",
      transformOrigin: "center",
    });
    expect(image).toHaveClass("grayscale");
    expect(artworkFrame).toHaveAttribute(
      "data-badge-artwork-surface",
      "card"
    );
    expect(artworkFrame).toHaveClass("overflow-visible");
    expect(artworkFrame).toHaveAttribute("data-badge-artwork", "real");
  });

  it("reserves layout space for the shared tall-artwork compensation", () => {
    const tallItem = requireItemByNumber(mapBadgeCollection({ awards: [] }), 14);

    render(<BadgeSlot item={tallItem} />);

    const button = screen.getByRole("button", {
      name: "Iron Streak, Rare, locked",
    });
    const image = within(button).getByRole("img", {
      name: "Iron Streak badge artwork",
    });
    const artworkFrame = image.closest("[data-badge-artwork]");

    expect(image).toHaveStyle({
      transform: "scale(0.99)",
      transformOrigin: "center",
    });
    expect(artworkFrame).toHaveClass("aspect-square");
    expect(artworkFrame?.parentElement).toHaveClass("h-60");
  });

  it("keeps artwork and lock overlays from blocking card clicks", () => {
    render(
      <BadgeGrid
        collection={mockFreePlayerBadgeCollection}
        entitlement={mockFreeBadgeEntitlement}
      />
    );

    const lockedCard = screen.getByRole("button", {
      name: "First Deployment, Common, locked",
    });
    const image = within(lockedCard).getByRole("img", {
      name: "First Deployment badge artwork",
    });
    const artworkFrame = image.closest("[data-badge-artwork]");

    expect(artworkFrame).toHaveClass("pointer-events-none");

    fireEvent.click(image);

    expect(screen.getByRole("dialog")).toHaveTextContent("First Deployment");
  });

  it("renders final reveal artwork for earned badges", () => {
    const missingArtworkEarnedItem = requireEarnedItemByNumber(11);

    render(
      <BadgeRevealOverlay
        item={missingArtworkEarnedItem}
        onClose={vi.fn()}
        reducedMotion
      />
    );

    expect(
      screen.getByRole("img", { name: "Five Victories badge artwork" })
    ).toHaveAttribute("src", "/assets/badges/11.png");
    expect(screen.queryByTestId("badge-artwork-fallback")).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: "IronClad Recruit free reveal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "First Victory premium reveal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Elite Champion free reveal" })
    ).toBeInTheDocument();
  });

  it("opens and clears the detail modal from the Phase 10 main collection grid", async () => {
    render(<Phase10PreviewPanel />);

    const collectionList = screen.getByRole("list", {
      name: "IronClad badge collection slots",
    });

    fireEvent.click(
      within(collectionList).getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Complete identity and ELO verification"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Close badge details" })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
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

  it("opens every pilot badge locked detail, earned detail, free reveal, and Premium reveal", async () => {
    render(<Phase10PreviewPanel />);

    for (const pilot of [
      {
        name: "IronClad Recruit",
        rarity: "Common",
        src: "/assets/badges/1.png",
      },
      {
        name: "First Victory",
        rarity: "Common",
        src: "/assets/badges/3.png",
      },
      {
        name: "Elite Champion",
        rarity: "Legendary",
        src: "/assets/badges/26.png",
      },
    ]) {
      fireEvent.click(
        screen.getAllByRole("button", {
          name: `${pilot.name}, ${pilot.rarity}, locked`,
        })[0]
      );
      expect(screen.getByRole("dialog")).toHaveTextContent(pilot.name);
      expect(
        within(screen.getByRole("dialog")).getByRole("img", {
          name: `${pilot.name} badge artwork`,
        })
      ).toHaveAttribute("src", pilot.src);
      fireEvent.click(
        screen.getByRole("button", { name: "Close badge details" })
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      fireEvent.click(
        screen.getAllByRole("button", {
          name: `${pilot.name}, ${pilot.rarity}, earned`,
        })[0]
      );
      expect(screen.getByRole("dialog")).toHaveTextContent(pilot.name);
      expect(
        within(screen.getByRole("dialog")).getByRole("img", {
          name: `${pilot.name} badge artwork`,
        })
      ).toHaveAttribute("src", pilot.src);
      fireEvent.click(
        screen.getByRole("button", { name: "Close badge details" })
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: `${pilot.name} free reveal` })
      );
      expect(screen.getByRole("dialog")).toHaveTextContent(pilot.name);
      expect(
        within(screen.getByRole("dialog")).getByRole("img", {
          name: `${pilot.name} badge artwork`,
        })
      ).toHaveAttribute("src", pilot.src);
      fireEvent.click(
        screen.getByRole("button", { name: "Not now" })
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: `${pilot.name} premium reveal` })
      );
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Premium badge reveal"
      );
      expect(
        within(screen.getByRole("dialog")).getByRole("img", {
          name: `${pilot.name} badge artwork`,
        })
      ).toHaveAttribute("src", pilot.src);
      expect(
        document.querySelector('[data-premium-badge-effects="true"]')
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Not now" })
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    }
  });
});

function BadgeRevealFocusRestoreFixture() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open reveal
      </button>
      {open ? (
        <BadgeQueue items={[mockNewUnlockQueued]} reducedMotion />
      ) : null}
    </>
  );
}

function requireItemByNumber(
  collection: ReturnType<typeof mapBadgeCollection>,
  number: number
) {
  const item = collection.items.find(
    (candidate) => candidate.definition.number === number
  );

  if (!item) {
    throw new Error(`Missing fixture badge ${number}.`);
  }

  return item;
}

function requireEarnedItemByNumber(number: number) {
  const item = requireItemByNumber(
    mapBadgeCollection({
      awards: [
        {
          badgeSlug: "five-victories",
          awardedAt: "2026-08-11T12:00:00.000Z",
        },
      ],
    }),
    number
  );

  if (item.state !== "earned") {
    throw new Error(`Expected fixture badge ${number} to be earned.`);
  }

  return item;
}
