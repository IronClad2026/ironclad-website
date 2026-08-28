import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function sliceSource(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing source slice: ${start} -> ${end}`);
  }
  return value.slice(startIndex, endIndex);
}

const commandCenter = source("app/admin/page.tsx");
const registrationsPage = source("app/admin/registrations/page.tsx");
const registrationActions = source("app/admin/registration-actions.ts");
const registrationRows = source("components/AdminRegistrationReviewRows.tsx");
const operationsLoader = source("lib/admin-operations.ts");
const operationsAttention = source("lib/admin-operations-metrics.ts");
const notifications = source("lib/notifications.ts");

describe("global Admin Registrations workspace route contract", () => {
  it("moves the complete cross-Tournament review surface off the Command Center", () => {
    expect(commandCenter).not.toContain("AdminRegistrationReviewRows");
    expect(commandCenter).not.toContain("approveSelectedRegistrations");
    expect(commandCenter).not.toContain('id="registration-review"');
    expect(commandCenter).not.toContain("get_tournament_bracket_readiness");

    for (const value of [
      "AdminRegistrationReviewRows",
      "approveSelectedRegistrations",
      'id="registration-review"',
      "get_tournament_bracket_readiness",
      "buildWaitlistPositionMap",
      "Waiting for a FIFO spot offer",
      "Tournament metadata unavailable",
      "Unknown tournament",
      "Registration Details",
      "Private Admin Note",
      "A waitlisted player cannot be promoted by an administrator.",
      "This division has launched",
      "This tournament is terminal",
    ]) {
      expect(registrationsPage).toContain(value);
    }
    expect(registrationsPage).not.toContain("InAppNotificationCenter");
  });

  it("exposes every existing status as a compact direct filter", () => {
    const filters = sliceSource(
      registrationsPage,
      "const filterOptions = [",
      "  return ("
    );

    for (const filter of [
      "all",
      "pending",
      "manual_review",
      "approved",
      "rejected",
      "waitlisted",
      "withdrawn",
    ]) {
      expect(filters).toContain(`filter: "${filter}"`);
    }
    expect(registrationsPage).toContain(
      'aria-label="Registration status filters"'
    );
    expect(registrationsPage).toContain(
      'returnHref="/admin/registrations"'
    );
  });

  it("keeps the final Command Center limited to actionable summaries", () => {
    const summaries = sliceSource(
      commandCenter,
      "const summaryCards = [",
      "  const bracketNotice"
    );

    expect(summaries).toContain('label: "Pending Registrations"');
    expect(summaries).toContain('label: "Manual Review Registrations"');
    expect(summaries).toContain('label: "Active Tournaments"');
    expect(summaries).not.toContain("Approved Players");
    expect(summaries).not.toContain("Rejected Players");
    expect(summaries).not.toContain("Waitlisted Players");

    expect(commandCenter).toContain('href="/admin/tournaments/new"');
    expect(commandCenter).toContain("Create Tournament");
    expect(commandCenter).toContain(
      'href="/admin/operations#attention-required"'
    );
    expect(commandCenter).toContain("Admin Notification Center");
    expect(commandCenter).toContain(
      'aria-label="Admin mobile workspace navigation"'
    );
  });

  it("updates every authoritative global caller without weakening Tournament returns", () => {
    expect(registrationActions).toContain(': "/admin/registrations";');
    expect(registrationActions).toContain(
      "`/admin/tournaments/${workspaceContext.tournamentId}`"
    );
    expect(registrationRows).toContain(
      'returnHref = "/admin/registrations"'
    );
    expect(operationsLoader).toContain(
      'href: "/admin/registrations"'
    );
    expect(operationsLoader).toContain(
      "`/admin/registrations?filter=${encodeURIComponent(row.registration_status)}&selected=${encodeURIComponent(row.id)}`"
    );
    expect(operationsAttention).toContain(
      'href: "/admin/registrations?filter=waitlisted"'
    );
    expect(notifications).toContain(
      "`/admin/registrations?filter=all&selected=${encodeURIComponent("
    );
    expect(notifications).toContain('return "/admin";');
  });

  it("keeps old bookmarks on a fixed, validated compatibility path", () => {
    expect(commandCenter).toContain("getLegacyRegistrationRedirect(params)");
    expect(commandCenter).toContain(
      "return `/admin/registrations?${target.toString()}`"
    );
    expect(commandCenter).toContain("registrationFilters.includes(");
    expect(commandCenter).toContain("registrationNotices.includes(");
    expect(commandCenter).toContain("registrationFocusTargets.includes(");
    expect(commandCenter).toContain("selected && isUuid(selected)");
    expect(commandCenter).not.toContain("redirectUrl");
    expect(commandCenter).not.toContain("returnTo");
  });
});
