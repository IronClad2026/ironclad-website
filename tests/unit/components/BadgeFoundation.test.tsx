// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

    expect(image).toHaveAttribute("src", "/assets/badges/1.png");
    expect(image).toHaveClass("object-contain");
    expect(image).not.toHaveClass("mix-blend-multiply");
    expect(image.className).not.toContain("bg-white");
    expect(image.closest("[data-badge-artwork]")).toHaveAttribute(
      "data-badge-artwork",
      "real"
    );
    expect(image.closest("[data-badge-artwork]")).toHaveAttribute(
      "data-badge-artwork-surface",
      "card"
    );
    expect(image.closest("[data-badge-artwork]")).toHaveClass(
      "pointer-events-none"
    );
    expect(image.closest("[data-badge-artwork]")?.className).not.toContain(
      "bg-white"
    );
  });

  it("renders locked BadgeSlot artwork when available", () => {
    render(<BadgeSlot item={mockLockedBadge} />);

    const button = screen.getByRole("button", {
      name: "First Deployment, Common, locked",
    });
    const image = within(button).getByRole("img", {
      name: "First Deployment badge artwork",
    });

    expect(image).toHaveAttribute("src", "/assets/badges/2.png");
    expect(image).toHaveClass("grayscale");
    expect(image).toHaveClass("object-contain");
    expect(image).toHaveClass("opacity-[0.72]");
    expect(image).toHaveClass("brightness-[0.88]");
    expect(image).not.toHaveClass("brightness-[0.52]");
    expect(image).not.toHaveClass("mix-blend-multiply");
    expect(image.closest("[data-badge-artwork]")).toHaveAttribute(
      "data-badge-artwork",
      "real"
    );
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

    expect(screen.getByTestId("badge-artwork-fallback")).toHaveTextContent("01");
    expect(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    ).toBeInTheDocument();
  });

  it("renders intentional fallback content for badges without artwork", () => {
    const missingArtworkItem = requireItemByNumber(
      mapBadgeCollection({ awards: [] }),
      11
    );

    expect(() => render(<BadgeSlot item={missingArtworkItem} />)).not.toThrow();

    const button = screen.getByRole("button", {
      name: "Five Victories, Uncommon, locked",
    });
    const fallback = within(button).getByTestId("badge-artwork-fallback");

    expect(within(button).queryByRole("img")).not.toBeInTheDocument();
    expect(fallback).toHaveTextContent("11");
    expect(fallback).toHaveTextContent("Five Victories");
    expect(fallback).toHaveTextContent("Uncommon");
    expect(fallback).toHaveTextContent("Locked");
    expect(fallback.closest("[data-badge-artwork]")).toHaveAttribute(
      "data-badge-artwork-surface",
      "fallback"
    );
    expect(fallback.closest("[data-badge-artwork]")).not.toHaveClass("border");
    expect(within(fallback).getByText("11")).not.toHaveClass("rounded-lg");
    expect(within(fallback).getByText("11")).not.toHaveClass("border");
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

  it("renders reveal fallback content for earned badges without artwork", () => {
    const missingArtworkEarnedItem = requireEarnedItemByNumber(11);

    render(
      <BadgeRevealOverlay
        item={missingArtworkEarnedItem}
        onClose={vi.fn()}
        reducedMotion
      />
    );

    const fallback = screen.getByTestId("badge-artwork-fallback");

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(fallback).toHaveTextContent("11");
    expect(fallback).toHaveTextContent("Five Victories");
    expect(fallback).toHaveTextContent("Uncommon");
    expect(fallback).toHaveTextContent("Earned");
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
        screen.getByRole("button", { name: "Close badge reveal" })
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
        screen.getByRole("button", { name: "Close badge reveal" })
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    }
  });
});

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
