import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const commandCenter = source("app/admin/page.tsx");
const legacyPage = source("app/admin/registrations/page.tsx");
const workspace = source("components/admin/tournaments/AdminTournamentRegistrations.tsx");
const loader = source("lib/admin-tournament-registration-workspace.ts");
const notifications = source("lib/notifications.ts");

describe("tournament registration route boundaries", () => {
  it("keeps both global entry routes free of operational registration forms", () => {
    for (const route of [commandCenter, legacyPage]) {
      expect(route).not.toContain("AdminRegistrationReviewRows");
      expect(route).not.toContain("approveSelectedRegistrations");
      expect(route).not.toContain('id="registration-review"');
    }
    expect(legacyPage).toContain("Choose a Tournament");
    expect(legacyPage).toContain('aria-label="Tournament registration workspaces"');
    expect(workspace).toContain("AdminRegistrationReviewRows");
    expect(workspace).toContain("approveSelectedRegistrations");
  });

  it("authenticates before a legacy registration lookup or redirect", () => {
    const authIndex = legacyPage.indexOf("await auth()");
    const lookupIndex = legacyPage.indexOf('.from("registrations")');
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(lookupIndex).toBeGreaterThan(authIndex);
    const guardIndex = legacyPage.indexOf("await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId)");
    expect(guardIndex).toBeGreaterThan(authIndex);
    expect(lookupIndex).toBeGreaterThan(guardIndex);
    expect(legacyPage).toContain('.select("id, tournament_id")');
    expect(legacyPage).toContain('.eq("id", selected)');
    expect(legacyPage).not.toContain("player_name");
    expect(legacyPage).not.toContain("admin_notes");
  });

  it("retains all six status filters in the selected tournament workspace", () => {
    for (const status of ["pending", "manual_review", "approved", "rejected", "waitlisted", "withdrawn"]) {
      expect(legacyPage).toContain(`"${status}"`);
      expect(loader).toContain(`"${status}"`);
    }
    expect(loader).toContain('.eq("tournament_id", tournament.id)');
    expect(workspace).toContain('name="workspaceTournamentId"');
  });

  it("uses explicit tournament notification context and preserves the fixed legacy resolver", () => {
    expect(notifications).toContain('if (row.tournament_id && isUuid(row.tournament_id) && isUuid(row.registration_id))');
    expect(notifications).toContain('section: "registrations"');
    expect(notifications).toContain("`/admin/tournaments/${encodeURIComponent(row.tournament_id)}?${params.toString()}`");
    expect(notifications).toContain("`/admin/registrations?filter=all&selected=${encodeURIComponent(");
    expect(legacyPage).toContain("registration.data?.id === selected");
    expect(legacyPage).toContain("tournament.data?.id === tournamentId");
    expect(legacyPage).toContain("missing tournament association remain retained");
  });

  it("keeps existing Command Center bookmarks on a validated compatibility path", () => {
    expect(commandCenter).toContain("getLegacyRegistrationRedirect(params)");
    expect(commandCenter).toContain("return `/admin/registrations?${target.toString()}`");
    expect(commandCenter).toContain("registrationFilters.includes(");
    expect(commandCenter).toContain("registrationNotices.includes(");
    expect(commandCenter).toContain("registrationFocusTargets.includes(");
    expect(commandCenter).toContain("selected && isUuid(selected)");
    expect(legacyPage).not.toContain("returnTo");
    expect(legacyPage).not.toContain("redirectUrl");
  });
});
