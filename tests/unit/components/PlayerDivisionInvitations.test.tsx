// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayerDivisionInvitations from "@/components/PlayerDivisionInvitations";
import type { PlayerTournamentDivisionInvitation } from "@/lib/tournament-division-invitations";

vi.mock("@/app/dashboard/registration-actions", () => ({
  respondToTournamentDivisionInvitationAction: vi.fn(async () => ({
    status: "success",
    message: "Invitation updated.",
  })),
}));

vi.mock("@/components/HydrationSafeLocalDateTime", () => ({
  default: ({ value }: { value: string }) => <time>{value}</time>,
}));

const invitation: PlayerTournamentDivisionInvitation = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "pending",
  createdAt: "2026-09-03T08:00:00.000Z",
  invalidationReason: null,
  targetTournamentId: "22222222-2222-4222-8222-222222222222",
  targetTournamentSlug: "ironclad-open-two",
  targetTournamentTitle: "IronClad Open Two",
  targetDivisionName: "Academy",
};

afterEach(() => cleanup());

describe("Player Division invitations", () => {
  it("keeps accept and decline available in the compact mobile layout", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    render(
      <PlayerDivisionInvitations invitations={[invitation]} loadError={false} />
    );

    const accept = screen.getByRole("button", {
      name: "Accept and continue",
    });
    const decline = screen.getByRole("button", { name: "Decline" });

    expect(accept).toHaveClass("min-h-11");
    expect(decline).toHaveClass("min-h-11");
    expect(accept.closest("form")).toHaveClass("grid", "sm:grid-cols-2");
    expect(screen.getByText(/does not transfer or register you/i)).toBeVisible();
  });

  it("keeps an accepted decision recoverable through the normal registration flow", () => {
    render(
      <PlayerDivisionInvitations
        invitations={[{ ...invitation, status: "accepted" }]}
        loadError={false}
      />
    );

    expect(
      screen.getByRole("link", { name: "Continue registration" })
    ).toHaveAttribute(
      "href",
      "/tournaments?tournament=ironclad-open-two&register=1"
    );
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });
});
