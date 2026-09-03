// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminBracketPopulation, {
  type BracketPopulationData,
} from "@/components/AdminBracketPopulation";

const saveBracketAssignmentsMock = vi.hoisted(() => vi.fn());

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    button: "button",
    div: "div",
  },
}));

vi.mock("@/app/admin/tournaments/actions", () => ({
  saveBracketAssignments: saveBracketAssignmentsMock,
}));

function bracket(): BracketPopulationData {
  return {
    generatedBracketId: "223e4567-e89b-42d3-a456-426614174000",
    bracketId: "323e4567-e89b-42d3-a456-426614174000",
    bracketName: "Academy Bracket With A Long Mobile Label",
    format: "single_elimination",
    slotCount: 8,
    assignments: Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [index + 1, null])
    ),
    participants: Array.from({ length: 8 }, (_, index) => ({
      id: `registration-${index + 1}`,
      name: `TESTACADEMY${index + 1}`,
      country: "US Forces",
      elo: 1_000,
    })),
  };
}

function openWorkspace() {
  render(
    <AdminBracketPopulation
      tournamentId="123e4567-e89b-42d3-a456-426614174000"
      tournamentTitle="TEST 2"
      bracket={bracket()}
      buttonLabel="Edit Private Seeding"
      workspaceTournamentId="123e4567-e89b-42d3-a456-426614174000"
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Edit Private Seeding" })
  );
  return screen.getByRole("dialog");
}

describe("administrator bracket population workspace", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses intrinsic mobile rows while retaining the desktop split workspace", () => {
    const dialog = openWorkspace();
    const scrollRegion = dialog.querySelector(
      "[data-bracket-workspace-scroll-region='true']"
    );
    const participantPanel = dialog.querySelector(
      "[data-bracket-participant-panel='true']"
    );
    const slotPanel = dialog.querySelector(
      "[data-bracket-slot-panel='true']"
    );
    const footer = dialog.querySelector(
      "[data-bracket-workspace-footer='true']"
    );

    expect(scrollRegion).toHaveClass(
      "grid-rows-[max-content_max-content]",
      "overflow-y-auto",
      "lg:grid-cols-[340px_minmax(0,1fr)]",
      "lg:grid-rows-1",
      "lg:overflow-hidden"
    );
    expect(participantPanel).not.toHaveClass("min-h-0", "overflow-hidden");
    expect(participantPanel).toHaveClass("lg:min-h-0", "lg:overflow-hidden");
    expect(slotPanel).toHaveClass(
      "overflow-visible",
      "lg:min-h-0",
      "lg:overflow-y-auto"
    );
    expect(footer).toHaveClass("relative", "z-20", "shrink-0");
  });

  it("renders all eight slots in order with touch-safe selectors and wrapped labels", () => {
    const dialog = openWorkspace();
    const slots = Array.from(
      dialog.querySelectorAll<HTMLElement>("[data-bracket-slot]")
    );

    expect(slots).toHaveLength(8);
    expect(slots.map((slot) => slot.dataset.bracketSlot)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);

    for (const [index, slot] of slots.entries()) {
      expect(slot).toHaveClass(
        "relative",
        "self-start",
        "overflow-visible"
      );
      expect(
        within(slot).getByText(
          `Opening Match ${Math.ceil((index + 1) / 2)} - Player ${
            (index + 1) % 2 === 1 ? "1" : "2"
          }`
        )
      ).toHaveClass("break-words", "[overflow-wrap:anywhere]");
      expect(within(slot).getByRole("combobox")).toHaveClass(
        "min-h-11",
        "w-full",
        "min-w-0",
        "touch-manipulation",
        "z-10"
      );
    }
  });

  it("preserves assignment, reset, and canonical save form behavior", async () => {
    const dialog = openWorkspace();
    const firstSlot = dialog.querySelector<HTMLElement>(
      "[data-bracket-slot='1']"
    );
    expect(firstSlot).not.toBeNull();
    const selector = within(firstSlot as HTMLElement).getByRole("combobox");

    fireEvent.change(selector, { target: { value: "registration-1" } });
    expect(selector).toHaveValue("registration-1");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="assignments"]')
        ?.value
    ).toContain('"registration_id":"registration-1"');

    fireEvent.click(screen.getByRole("button", { name: "Reset Changes" }));
    expect(selector).toHaveValue("");

    fireEvent.change(selector, { target: { value: "registration-1" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save Private Bracket Assignments",
      })
    );

    await waitFor(() => expect(saveBracketAssignmentsMock).toHaveBeenCalled());
    const submitted = saveBracketAssignmentsMock.mock.calls[0][0] as FormData;
    expect(submitted.get("tournamentId")).toBe(
      "123e4567-e89b-42d3-a456-426614174000"
    );
    expect(String(submitted.get("assignments"))).toContain(
      '"registration_id":"registration-1"'
    );
  });
});
