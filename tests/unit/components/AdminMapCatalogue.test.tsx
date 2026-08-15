// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminMapCatalogue from "@/components/AdminMapCatalogue";
import type { Coh3MapRow } from "@/lib/coh3-maps";

vi.mock("@/app/admin/maps/actions", () => ({
  saveCoh3Map: vi.fn(),
}));

const officialMap: Coh3MapRow = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  slug: "road-to-tunis",
  displayName: "Road to Tunis",
  sourceType: "official",
  creatorName: "Community Cartographer",
  gameMode: "1v1",
  status: "active",
  thumbnailPath: null,
  sourceReference: "official-patch-source",
  adminNote: "Private catalogue note.",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  createdByClerkUserId: "admin-1",
  updatedByClerkUserId: "admin-1",
};

describe("AdminMapCatalogue", () => {
  afterEach(cleanup);

  it("keeps the map slug stable and exposes private metadata only in Admin", () => {
    render(
      <AdminMapCatalogue
        maps={[officialMap]}
        filters={{ query: "", sourceType: "", status: "" }}
      />
    );

    const slugFields = screen.getAllByLabelText("Stable slug");
    expect(slugFields).toHaveLength(2);
    expect(slugFields[0]).not.toHaveAttribute("readonly");
    expect(slugFields[1]).toHaveValue("road-to-tunis");
    expect(slugFields[1]).toHaveAttribute("readonly");
    const mapCard = screen
      .getByRole("heading", { name: "Road to Tunis" })
      .closest("article");
    expect(mapCard).not.toBeNull();
    expect(within(mapCard as HTMLElement).getAllByText("Official").length)
      .toBeGreaterThan(0);
    expect(within(mapCard as HTMLElement).getByText("1v1"))
      .toBeInTheDocument();
    expect(screen.getAllByLabelText("Private Admin note")[1])
      .toHaveValue("Private catalogue note.");
  });
});
