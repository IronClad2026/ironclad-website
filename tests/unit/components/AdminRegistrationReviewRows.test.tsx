// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminRegistrationReviewRows from "@/components/AdminRegistrationReviewRows";
import type { AdminRegistrationReviewRow } from "@/lib/admin-registration-review";

const longPlayerName =
  "PlayerWithAnExceptionallyLongUnbrokenCompetitiveDisplayNameThatMustWrap";
const longTournamentName =
  "IronClad Championship With A Deliberately Long Tournament Name For Narrow Screens";

function reviewRow(
  overrides: Partial<AdminRegistrationReviewRow> = {}
): AdminRegistrationReviewRow {
  return {
    registrationId: "registration-main-1",
    tournamentId: "tournament-1",
    playerDisplayName: longPlayerName,
    tournamentName: longTournamentName,
    selectedBracket: "Challenge",
    frozenRegistrationElo: 1_425,
    verifiedDivision: "Challenge",
    verifiedFaction: "British Forces",
    verificationSource: "relic",
    verificationCheckedAt: "2026-08-05T09:59:00.000Z",
    eligibilityRulesVersion: "relic-highest-1v1-v1",
    status: "pending",
    registeredAt: "2026-08-05T10:00:00.000Z",
    registrationOrder: 2,
    waitlistPosition: null,
    waitlistOfferStatus: null,
    privateAdminNote: "Private review context",
    isDivisionLaunched: false,
    ...overrides,
  };
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

function renderRows(
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>,
  registration = reviewRow(),
  isTournamentTerminal = false,
  desktopPresentation?: "standard" | "tournament-workbench"
) {
  return render(
    <form id="registration-bulk-form">
      <AdminRegistrationReviewRows
        registrations={[registration]}
        activeFilter="pending"
        formId="registration-bulk-form"
        selectionScope="pending:tournament-1"
        desktopPresentation={desktopPresentation}
        isTournamentTerminal={isTournamentTerminal}
        updateRegistrationStatusAction={updateRegistrationStatusAction}
      />
    </form>
  );
}

function getCard(container: HTMLElement) {
  const cards = container.querySelector(
    "[data-registration-review-cards='true']"
  );
  expect(cards).not.toBeNull();

  const card = cards?.querySelector("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("administrator registration review responsive interaction", () => {
  beforeEach(() => {
    setViewport(360, 800);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens an edge-safe action menu through an explicit touch control", () => {
    const { container } = renderRows(vi.fn());
    const card = getCard(container);
    const trigger = within(card).getByRole("button", {
      name: `Open actions for ${longPlayerName}`,
    });

    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 311,
      y: 736,
      width: 44,
      height: 44,
      top: 736,
      right: 355,
      bottom: 780,
      left: 311,
      toJSON: () => ({}),
    });

    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveClass("min-h-11", "min-w-11");
    expect(within(trigger).getByText("Actions")).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", {
      name: `Registration actions for ${longPlayerName}`,
    });
    expect(menu).toHaveStyle({ left: "72px", top: "308px" });
    expect(menu).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "w-[min(17rem,calc(100vw-2rem))]",
      "overflow-y-auto"
    );
  });

  it("offers direct approval and reachable review decision links", async () => {
    const action = vi.fn<(formData: FormData) => void>();
    const { container } = renderRows(action);
    const card = getCard(container);

    fireEvent.click(
      within(card).getByRole("button", {
        name: `Open actions for ${longPlayerName}`,
      })
    );

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Review Details" }))
      .toHaveAttribute(
        "href",
        "/admin/registrations?filter=pending&selected=registration-main-1"
      );
    expect(within(menu).getByRole("menuitem", { name: "Reject" }))
      .toHaveAttribute(
        "href",
        "/admin/registrations?filter=pending&selected=registration-main-1&focus=reject"
      );
    expect(
      within(menu).getByRole("menuitem", { name: "Mark Manual Review" })
    ).toHaveAttribute(
      "href",
      "/admin/registrations?filter=pending&selected=registration-main-1&focus=manual_review"
    );
    expect(within(menu).queryByRole("menuitem", { name: /Waitlist/i }))
      .not.toBeInTheDocument();

    const approve = within(menu).getByRole("menuitem", { name: "Approve" });
    expect(approve).toHaveAttribute("type", "submit");
    expect(approve).toHaveClass("min-h-11");
    fireEvent.click(approve);

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = action.mock.calls[0][0];
    expect(submitted.get("registrationId")).toBe("registration-main-1");
    expect(submitted.get("nextStatus")).toBe("approved");
    expect(submitted.get("activeFilter")).toBe("pending");
    expect(submitted.get("adminNotes")).toBe("Private review context");
  });

  it("never offers direct promotion for a waitlisted registration", () => {
    const action = vi.fn<(formData: FormData) => void>();
    const registration = reviewRow({
      status: "waitlisted",
      waitlistPosition: 1,
      waitlistOfferStatus: "offered",
    });
    const { container } = renderRows(action, registration);
    const card = getCard(container);

    fireEvent.click(
      within(card).getByRole("button", {
        name: `Open actions for ${longPlayerName}`,
      })
    );

    const menu = screen.getByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Approve" }))
      .not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /Promote/i })
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /Pending Review/i })
    ).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Reject" }))
      .toBeInTheDocument();
    expect(within(card).getByText("Offer Offered")).toBeInTheDocument();
  });

  it("locks roster decisions and bulk selection after division launch", () => {
    const action = vi.fn<(formData: FormData) => void>();
    const registration = reviewRow({ isDivisionLaunched: true });
    const { container } = renderRows(action, registration);
    const card = getCard(container);
    const checkbox = within(card).getByRole("checkbox");

    expect(checkbox).toBeDisabled();
    expect(
      within(card).getByText("Division launched — roster decisions are locked.")
    ).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole("button", {
        name: `Open actions for ${longPlayerName}`,
      })
    );
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: "Review Details" }))
      .toBeInTheDocument();
  });

  it.each(["cancelled", "voided"] as const)(
    "locks %s tournament competition controls while retaining review access",
    () => {
      const { container } = renderRows(vi.fn(), reviewRow(), true);
      const card = getCard(container);

      expect(within(card).getByRole("checkbox")).toBeDisabled();
      expect(
        within(card).getByText(
          "Terminal tournament — competition controls are locked."
        )
      ).toBeInTheDocument();

      fireEvent.click(
        within(card).getByRole("button", {
          name: `Open actions for ${longPlayerName}`,
        })
      );
      const menu = screen.getByRole("menu");
      expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
      expect(
        within(menu).getByRole("menuitem", { name: "Review Details" })
      ).toBeInTheDocument();
      expect(
        within(menu).queryByRole("menuitem", { name: "Approve" })
      ).not.toBeInTheDocument();
    }
  );

  it("keeps cards primary below xl and contains the desktop table overflow", () => {
    const { container } = renderRows(vi.fn());
    const cards = container.querySelector(
      "[data-registration-review-cards='true']"
    );
    const table = container.querySelector("table");

    expect(cards).toHaveClass("grid", "min-w-0", "xl:hidden");
    expect(table).toHaveClass("min-w-[900px]", "2xl:min-w-[1080px]");
    expect(table?.parentElement).toHaveClass(
      "hidden",
      "max-w-full",
      "overflow-x-auto",
      "overscroll-x-contain",
      "xl:block"
    );
  });

  it("preserves the standard Tournament-specific desktop presentation by default", () => {
    const { container } = renderRows(vi.fn());
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const tableQueries = within(table as HTMLTableElement);

    expect(
      tableQueries.getByRole("columnheader", {
        name: "Tournament / Division",
      })
    ).toBeInTheDocument();
    expect(
      tableQueries.getByRole("columnheader", { name: "Registration ELO" })
    ).toBeInTheDocument();
    expect(tableQueries.getByText(longTournamentName)).toBeInTheDocument();
    expect(
      tableQueries.getByText(
        "Frozen at registration, not current profile ELO"
      )
    ).toBeInTheDocument();
  });

  it("compacts only the workbench desktop table while preserving accessible evidence and controls", () => {
    const { container } = renderRows(
      vi.fn(),
      reviewRow(),
      false,
      "tournament-workbench"
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const tableQueries = within(table as HTMLTableElement);

    expect(
      tableQueries.getByRole("columnheader", { name: "Division" })
    ).toBeInTheDocument();
    expect(
      tableQueries.getByRole("columnheader", { name: "Frozen ELO" })
    ).toBeInTheDocument();
    expect(
      tableQueries.getByRole("columnheader", {
        name: "Verification Evidence",
      })
    ).toBeInTheDocument();
    expect(tableQueries.queryByText(longTournamentName)).not.toBeInTheDocument();
    expect(
      tableQueries.queryByText(
        "Frozen at registration, not current profile ELO"
      )
    ).not.toBeInTheDocument();
    expect(tableQueries.getByText((1_425).toLocaleString())).toBeInTheDocument();
    expect(tableQueries.getAllByText("Challenge")).toHaveLength(2);
    expect(tableQueries.getByText("British Forces")).toBeInTheDocument();
    expect(tableQueries.getByText("Relic")).toBeInTheDocument();
    expect(
      tableQueries.getByText(
        new Date("2026-08-05T09:59:00.000Z").toLocaleString()
      )
    ).toBeInTheDocument();
    expect(
      tableQueries.getByText("relic-highest-1v1-v1")
    ).toBeInTheDocument();

    for (const label of [
      "Verified division:",
      "Verification source:",
      "Verified faction:",
      "Verification checked:",
    ]) {
      expect(tableQueries.getByText(label)).toHaveClass("sr-only");
    }

    const checkbox = tableQueries.getByRole("checkbox", {
      name: `Select registration for ${longPlayerName}`,
    });
    expect(checkbox).toHaveAttribute("form", "registration-bulk-form");
    expect(checkbox).toHaveAttribute(
      "data-registration-selection-scope",
      "pending:tournament-1"
    );
    expect(checkbox).toBeEnabled();
    expect(
      tableQueries.getByRole("button", {
        name: `Open actions for ${longPlayerName}`,
      })
    ).toBeInTheDocument();

    const card = getCard(container);
    expect(within(card).getByText(longTournamentName)).toBeInTheDocument();
    expect(
      within(card).getByText(
        "Captured at registration; not current profile ELO."
      )
    ).toBeInTheDocument();
  });

  it("labels safe evidence and wraps long player and tournament names", () => {
    const { container } = renderRows(vi.fn());
    const card = getCard(container);
    const cardQueries = within(card);

    for (const label of [
      "Frozen tournament registration ELO",
      "Verified division",
      "Verified faction",
      "Verification source",
      "Verification / check time",
      "Eligibility rules version",
      "Registered at",
      "Waitlist position",
    ]) {
      expect(cardQueries.getByText(label)).toBeInTheDocument();
    }

    expect(
      cardQueries.getByText("Captured at registration; not current profile ELO.")
    ).toBeInTheDocument();
    expect(cardQueries.getByText(longPlayerName)).toHaveClass("break-words");
    expect(cardQueries.getByText(longTournamentName)).toHaveClass(
      "break-words"
    );
    expect(cardQueries.getByRole("link", { name: "Review details" }))
      .toHaveClass("min-h-11");
  });
});
