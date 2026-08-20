// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardBadgeCollection from "@/components/badges/DashboardBadgeCollection";
import { buildDashboardBadgeData } from "@/lib/badges/dashboard";
import type { PlayerBadgeAward } from "@/lib/badges/types";

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

describe("DashboardBadgeCollection", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders the canonical full collection and production empty awards as 0/30", () => {
    render(<DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />);

    expect(
      screen.getByRole("heading", {
        name: "Your IronClad badge collection",
      })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("0/30 earned")).toBeInTheDocument();
    expect(getCollectionButtons()).toHaveLength(30);
    expect(getCollectionButtons()[0].dataset.badgeSlug).toBe(
      "ironclad-recruit"
    );
    expect(getCollectionButtons()[29].dataset.badgeSlug).toBe(
      "season-champion"
    );
    expect(
      getCollectionButtons().every(
        (button) => button.dataset.badgeState === "locked"
      )
    ).toBe(true);
  });

  it("filters all, earned, and locked states", () => {
    render(
      <DashboardBadgeCollection
        badgeData={buildDashboardBadgeData({
          awards: makeAwards(),
        })}
      />
    );

    expect(screen.getByLabelText("3/30 earned")).toBeInTheDocument();
    expect(getCollectionButtons()).toHaveLength(30);

    fireEvent.click(screen.getByRole("tab", { name: "Earned" }));
    expect(getCollectionButtons()).toHaveLength(3);
    expect(
      getCollectionButtons().map((button) => button.dataset.badgeSlug)
    ).toEqual(["ironclad-recruit", "first-victory", "five-victories"]);

    fireEvent.click(screen.getByRole("tab", { name: "Locked" }));
    expect(getCollectionButtons()).toHaveLength(27);
    expect(
      getCollectionButtons().some(
        (button) => button.dataset.badgeSlug === "ironclad-recruit"
      )
    ).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(getCollectionButtons()).toHaveLength(30);
  });

  it("opens modal details for earned and locked badges", async () => {
    render(
      <DashboardBadgeCollection
        badgeData={buildDashboardBadgeData({
          awards: makeAwards(),
        })}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, earned",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByRole("dialog")).toHaveTextContent("Earned");
    expect(screen.getByRole("dialog")).toHaveTextContent("Original awarded");

    fireEvent.click(screen.getByRole("button", { name: "Close badge details" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Battle Tested, Uncommon, locked",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("Battle Tested");
    expect(screen.getByRole("dialog")).toHaveTextContent("Locked");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Complete 10 official IronClad matches."
    );
  });

  it("opens badges with Enter and Space", async () => {
    render(<DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />);

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "First Victory, Common, locked",
      }),
      { key: "Enter" }
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("First Victory");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Five Victories, Uncommon, locked",
      }),
      { key: " " }
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Five Victories");
  });

  it("uses the intentional missing-artwork fallback without broken images", () => {
    render(<DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />);

    const fiveVictories = screen.getByRole("button", {
      name: "Five Victories, Uncommon, locked",
    });
    const fallback = within(fiveVictories).getByTestId(
      "badge-artwork-fallback"
    );

    expect(fallback).toHaveTextContent("11");
    expect(within(fiveVictories).queryByRole("img")).not.toBeInTheDocument();
    expect(fallback.closest("[data-badge-artwork]")).toHaveAttribute(
      "data-badge-artwork",
      "fallback"
    );
  });

  it("renders transparent real artwork and bounded responsive grid classes", () => {
    render(<DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />);

    const realImage = screen.getByRole("img", {
      name: "IronClad Recruit badge artwork",
    });
    const grid = screen.getByRole("list", {
      name: "IronClad badge collection slots",
    });

    expect(realImage).toHaveAttribute("src", "/assets/badges/1.png");
    expect(realImage).toHaveClass("object-contain");
    expect(realImage.closest("[data-badge-artwork]")).toHaveAttribute(
      "data-badge-artwork-surface",
      "card"
    );
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid).toHaveClass("md:grid-cols-3");
    expect(grid).toHaveClass("lg:grid-cols-4");
    expect(grid).toHaveClass("xl:grid-cols-5");
    expect(grid).toHaveClass("2xl:grid-cols-6");
    expect(grid.className).not.toContain("grid-cols-10");
  });

  it("links back to the main dashboard", () => {
    render(<DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });
});

function getCollectionButtons() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[data-badge-slug]")
  );
}

function makeAwards(): PlayerBadgeAward[] {
  return [
    {
      badgeSlug: "ironclad-recruit",
      awardedAt: "2026-08-01T10:00:00.000Z",
      originalAwardedAt: "2026-08-01T10:00:00.000Z",
    },
    {
      badgeSlug: "first-victory",
      awardedAt: "2026-08-03T18:30:00.000Z",
      originalAwardedAt: "2026-08-03T18:30:00.000Z",
    },
    {
      badgeSlug: "five-victories",
      awardedAt: "2026-08-11T18:30:00.000Z",
      originalAwardedAt: "2026-08-11T18:30:00.000Z",
    },
  ];
}
