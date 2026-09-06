import { describe, expect, it } from "vitest";
import { groupDashboardRegistrations, type PlayerRegistration } from "@/components/dashboard/registration-presentation";

type Registration = Pick<PlayerRegistration, "tournament_status" | "registration_status" | "waitlist_offer_status" | "launched_at"> & { id: string };
const record = (id: string, overrides: Partial<Registration> = {}): Registration => ({
  id, tournament_status: "registration_open", registration_status: "approved",
  waitlist_offer_status: null, launched_at: null, ...overrides,
});

describe("Dashboard registration presentation grouping", () => {
  it("keeps offers first without mutating source order or changing record fields", () => {
    const rows = Object.freeze([
      record("first"), record("second"), record("offer", { registration_status: "waitlisted", waitlist_offer_status: "offered" }),
    ]);
    const { current, previous } = groupDashboardRegistrations(rows);
    expect(current.map((row) => row.id)).toEqual(["offer", "first", "second"]);
    expect(current[0]).toBe(rows[2]);
    expect(rows.map((row) => row.id)).toEqual(["first", "second", "offer"]);
    expect(previous).toEqual([]);
  });

  it("keeps every completed, cancelled, voided, withdrawn and rejected record reachable", () => {
    const rows = [
      record("completed", { tournament_status: "completed", launched_at: "2026-08-01T00:00:00Z" }),
      record("cancelled", { tournament_status: "cancelled", waitlist_offer_status: "offered" }),
      record("voided", { tournament_status: "voided" }),
      record("withdrawn", { registration_status: "withdrawn" }),
      record("rejected", { registration_status: "rejected" }),
      record("live", { tournament_status: "in_progress", launched_at: "2026-08-01T00:00:00Z" }),
    ];
    const { current, previous } = groupDashboardRegistrations(rows);
    expect(current.map((row) => row.id)).toEqual(["live"]);
    expect(previous.map((row) => row.id)).toEqual(["completed", "cancelled", "voided", "withdrawn", "rejected"]);
    expect([...current, ...previous]).toHaveLength(rows.length);
  });

  it("does not hide offers or ambiguous completed records behind history", () => {
    const rows = [
      record("completed-offer", { tournament_status: "completed", launched_at: "2026-08-01T00:00:00Z", waitlist_offer_status: "offered" }),
      record("unknown-launch", { tournament_status: "completed" }),
      record("review", { registration_status: "manual_review" }),
      record("waiting", { registration_status: "waitlisted" }),
    ];
    expect(groupDashboardRegistrations(rows).current).toEqual(rows);
    expect(groupDashboardRegistrations(rows).previous).toEqual([]);
  });
});
