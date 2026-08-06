import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminPageSource = readFileSync(
  resolve(process.cwd(), "app/admin/page.tsx"),
  "utf8"
);
const reviewRowsSource = readFileSync(
  resolve(process.cwd(), "components/AdminRegistrationReviewRows.tsx"),
  "utf8"
);
const cohortMigrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260805150000_eight_player_registration_cohort.sql"
  ),
  "utf8"
);

function sliceSource(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new Error(
      `Unable to find source slice from ${startMarker} to ${endMarker}.`
    );
  }

  return source.slice(start, end);
}

function compact(source: string) {
  return source.replace(/\s+/g, " ").trim();
}

function registrationUpdatePayloads(source: string) {
  return [...source.matchAll(/\.from\(\s*"registrations"\s*\)\s*\.update\(\{([\s\S]*?)\}\)\s*\.eq/g)].map(
    (match) => compact(match[1])
  );
}

function rpcNames(source: string) {
  return [...source.matchAll(/\.rpc\(\s*"([^"]+)"/g)].map(
    (match) => match[1]
  );
}

const notificationBuilder = sliceSource(
  adminPageSource,
  "function buildRegistrationStatusNotification(",
  "async function updateRegistrationStatus("
);
const updateRegistrationStatusAction = sliceSource(
  adminPageSource,
  "async function updateRegistrationStatus(",
  "async function deleteSelectedRegistrations("
);
const approveSelectedRegistrationsAction = sliceSource(
  adminPageSource,
  "async function approveSelectedRegistrations(",
  "export default async function AdminPage("
);
const selectedRegistrationModal = sliceSource(
  adminPageSource,
  "{selectedRegistration && (",
  "    </main>"
);
const directStatusAction = sliceSource(
  reviewRowsSource,
  "function DirectStatusAction(",
  "function MenuLink("
);
const menuActions = sliceSource(
  reviewRowsSource,
  "function getMenuActions(",
  "function EvidenceValue("
);
const compactCohortMigration = compact(cohortMigrationSource.toLowerCase());
const cohortGuard = sliceSource(
  compactCohortMigration,
  "create or replace function public.enforce_tournament_registration_availability()",
  "alter function public.enforce_tournament_registration_availability()"
);

describe("admin registration review action contracts", () => {
  it("keeps every existing decision and private-note control in one workflow", () => {
    const compactAction = compact(updateRegistrationStatusAction);
    const compactModal = compact(selectedRegistrationModal);
    const compactDirectAction = compact(directStatusAction);
    const compactMenuActions = compact(menuActions);

    expect(compactAction).toContain(
      'const validStatuses: RegistrationStatus[] = [ "pending", "manual_review", "approved", "rejected", "waitlisted", ];'
    );
    expect(compactModal).toContain('name="adminNotes"');
    expect(compactModal).toContain("Save Private Note");
    expect(compactModal).toContain(
      'name="nextStatus" value={selectedRegistration.status}'
    );

    for (const status of [
      "approved",
      "rejected",
      "manual_review",
      "waitlisted",
    ]) {
      expect(compactModal).toContain(`name="nextStatus" value="${status}"`);
    }

    expect(compactMenuActions).toContain('nextStatus: "approved"');
    expect(compactMenuActions).toContain('label: "Reject"');
    expect(compactMenuActions).toContain('focus: "manual_review"');
    expect(compactMenuActions).toContain('focus: "waitlist"');
    expect(compactMenuActions).toContain('label: "Edit Private Note"');
    expect(compactMenuActions).toContain(
      'status === "waitlisted" ? "Promote to Participant" : "Approve"'
    );
    expect(compactModal).toContain('status === "waitlisted"');
    expect(compactModal).toContain('"Approve From Waitlist"');
    expect(compactDirectAction).toContain(
      "<form action={updateRegistrationStatusAction}"
    );
    expect(compactDirectAction).toContain(
      'name="adminNotes" value={registration.privateAdminNote ?? ""}'
    );
  });

  it("limits review mutations to status and the private administrator note", () => {
    const individualPayloads = registrationUpdatePayloads(
      updateRegistrationStatusAction
    );
    const bulkPayloads = registrationUpdatePayloads(
      approveSelectedRegistrationsAction
    );

    expect(individualPayloads).toEqual([
      "registration_status: nextStatus, admin_notes: adminNotes,",
    ]);
    expect(bulkPayloads).toEqual([
      'registration_status: "approved"',
    ]);

    const mutationPayloads = [...individualPayloads, ...bulkPayloads].join(
      " "
    );
    for (const immutableSnapshotField of [
      "submitted_elo",
      "elo_verified_elo",
      "elo_highest_faction",
      "elo_checked_at",
      "elo_verification_source",
      "elo_verified_division",
      "elo_calculation_version",
      "created_at",
      "tournament_id",
      "tournament_bracket_id",
    ]) {
      expect(mutationPayloads).not.toContain(immutableSnapshotField);
    }
  });

  it("does not generate, publish, or start competition as a review side effect", () => {
    const reviewActions = compact(
      `${updateRegistrationStatusAction}\n${approveSelectedRegistrationsAction}`
    );

    expect(rpcNames(updateRegistrationStatusAction)).toEqual([
      "is_tournament_bracket_regeneration_safe",
    ]);
    expect(rpcNames(approveSelectedRegistrationsAction)).toEqual([]);

    for (const forbiddenEffect of [
      'from("generated_brackets")',
      'from("tournaments")',
      "generateTournamentBracket",
      "generate_tournament_bracket",
      "saveBracketAssignments",
      "save_bracket_assignments",
      "publishTournamentBracket",
      "startTournament",
      'status: "in_progress"',
      'status = "in_progress"',
    ]) {
      expect(reviewActions).not.toContain(forbiddenEffect);
    }
  });

  it("builds generic player notifications without private review context", () => {
    const compactNotifications = compact(notificationBuilder);
    const notificationCall = sliceSource(
      updateRegistrationStatusAction,
      "const notification = buildRegistrationStatusNotification({",
      "  if (notification)"
    );

    expect(compactNotifications).toContain(
      "You have been approved for ${tournamentTitle}."
    );
    expect(compactNotifications).toContain(
      "Your registration for ${tournamentTitle} has been rejected."
    );
    expect(compactNotifications).toContain(
      "Your registration for ${tournamentTitle} is currently under manual review."
    );
    expect(compactNotifications).toContain(
      "You have been added to the waitlist for ${tournamentTitle}."
    );
    expect(compactNotifications.toLowerCase()).not.toContain("admin_notes");
    expect(compactNotifications).not.toContain("adminNotes");
    expect(compactNotifications).not.toContain("privateAdminNote");
    expect(notificationCall).not.toContain("adminNotes");
    expect(notificationCall).not.toContain("admin_notes");
  });
});

describe("Slice 1 registration cohort safeguards", () => {
  it("keeps the eight-place active cohort scoped to one tournament division", () => {
    expect(cohortGuard).toContain(
      "v_active_cohort_limit constant integer := 8"
    );
    expect(cohortGuard).toContain(
      "count(*) filter ( where registration_status in ( 'pending', 'manual_review', 'approved' ) )"
    );
    expect(cohortGuard).not.toContain(
      "where registration_status in ( 'pending', 'manual_review', 'approved', 'waitlisted' )"
    );
    expect(cohortGuard).not.toContain(
      "where registration_status in ( 'pending', 'manual_review', 'approved', 'rejected' )"
    );
    expect(cohortGuard).toContain(
      "where bracket.id = new.tournament_bracket_id and tournament.id = new.tournament_id"
    );
    expect(cohortGuard).toContain(
      "from public.registrations where tournament_bracket_id = new.tournament_bracket_id and id <> new.id"
    );
  });

  it("keeps manual waitlist promotion deterministic and oldest-first", () => {
    expect(cohortGuard).toContain(
      "registration.tournament_bracket_id = new.tournament_bracket_id"
    );
    expect(cohortGuard).toContain(
      "registration.created_at < new.created_at or ( registration.created_at = new.created_at and registration.id::text < new.id::text )"
    );
    expect(cohortGuard).toContain(
      "old.registration_status = 'waitlisted' and new.registration_status = 'approved'"
    );
    expect(cohortGuard).toContain(
      "cannot promote this registration before older waitlisted registrations for the same bracket"
    );
    expect(cohortGuard).toContain(
      "cannot approve a manual registration insert while waitlisted registrations exist for the same bracket"
    );
  });
});
