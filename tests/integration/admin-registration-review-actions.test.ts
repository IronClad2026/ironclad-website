import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminPageSource = readFileSync(
  resolve(process.cwd(), "app/admin/page.tsx"),
  "utf8"
);
const registrationActionsSource = readFileSync(
  resolve(process.cwd(), "app/admin/registration-actions.ts"),
  "utf8"
);
const reviewRowsSource = readFileSync(
  resolve(process.cwd(), "components/AdminRegistrationReviewRows.tsx"),
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
  registrationActionsSource,
  "function buildRegistrationStatusNotification(",
  "export async function updateRegistrationStatus("
);
const updateRegistrationStatusAction = sliceSource(
  registrationActionsSource,
  "export async function updateRegistrationStatus(",
  "export async function deleteSelectedRegistrations("
);
const deleteSelectedRegistrationsAction = sliceSource(
  registrationActionsSource,
  "export async function deleteSelectedRegistrations(",
  "export async function approveSelectedRegistrations("
);
const approveSelectedRegistrationsAction = registrationActionsSource.slice(
  registrationActionsSource.indexOf(
    "export async function approveSelectedRegistrations("
  )
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
describe("admin registration review action contracts", () => {
  it("keeps registration mutations authoritative in one action module", () => {
    const compactPage = compact(adminPageSource);
    const compactActions = compact(registrationActionsSource);

    expect(compactPage).toContain(
      'from "@/app/admin/registration-actions"'
    );
    expect(adminPageSource).not.toContain(
      "async function updateRegistrationStatus("
    );
    expect(adminPageSource).not.toContain(
      "async function deleteSelectedRegistrations("
    );
    expect(adminPageSource).not.toContain(
      "async function approveSelectedRegistrations("
    );
    expect(compactActions).toContain(
      "export async function updateRegistrationStatus(formData: FormData)"
    );
    expect(compactActions).toContain(
      "export async function deleteSelectedRegistrations(formData: FormData)"
    );
    expect(compactActions).toContain(
      "export async function approveSelectedRegistrations(formData: FormData)"
    );
  });

  it("accepts only a fixed UUID-scoped registration workspace return path", () => {
    const compactActions = compact(registrationActionsSource);

    expect(compactActions).toContain(
      'formData.get("workspaceTournamentId")'
    );
    expect(compactActions).toContain('formData.get("workspaceSection")');
    expect(compactActions).toContain(
      'section !== "registrations" && section !== "players-waitlist"'
    );
    expect(compactActions).toContain("!isUuid(tournamentId)");
    expect(compactActions).toContain(
      "`/admin/tournaments/${workspaceContext.tournamentId}`"
    );
    expect(compactActions).toContain(': "/admin";');
    expect(compactActions).toContain(
      "revalidatePath(`/admin/tournaments/${workspaceContext.tournamentId}`)"
    );
    expect(compactActions).toContain('params.set("filter", filter)');
    expect(compactActions).toContain('params.set("selected", selected)');
    expect(compactActions).toContain('params.set("notice", notice)');
    expect(compactActions).toContain('params.set("detail", detail)');
    expect(compactActions).toContain('params.set("focus", focus)');
    expect(compactActions).not.toContain("returnTo");
    expect(compactActions).not.toContain("redirectUrl");
  });

  it("excludes launched-division history from active FIFO queue projections", () => {
    const compactAdminPage = compact(adminPageSource);

    expect(compactAdminPage).toContain(
      "const isBracketWaitlistOpen = (bracketId: string | null) => bracketId !== null && bracketMetaById.get(bracketId)?.launchedAt === null && bracketMetaById.get(bracketId)?.isTournamentTerminal === false;"
    );
    expect(
      [...adminPageSource.matchAll(/isBracketWaitlistOpen\(/g)]
    ).toHaveLength(3);
    expect(adminPageSource).toMatch(
      /registrationOrderInputs\.filter\(\s*\(\{\s*tournamentBracketId\s*\}\)\s*=>\s*isBracketWaitlistOpen\(tournamentBracketId\)\s*\)/
    );
  });

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
    ]) {
      expect(compactModal).toContain(`name="nextStatus" value="${status}"`);
    }

    expect(compactMenuActions).toContain('nextStatus: "approved"');
    expect(compactMenuActions).toContain('label: "Reject"');
    expect(compactMenuActions).toContain('focus: "manual_review"');
    expect(compactMenuActions).not.toContain('focus: "waitlist"');
    expect(compactMenuActions).not.toContain("Move to Waitlist");
    expect(compactMenuActions).not.toContain("Move Back to Waitlist");
    expect(compactMenuActions).toContain('label: "Edit Private Note"');
    expect(compactMenuActions).not.toContain("Promote to Participant");
    expect(compactMenuActions).toContain('if (status === "waitlisted")');
    const waitlistedActions = sliceSource(
      compactMenuActions,
      'if (status === "waitlisted")',
      'if (status === "approved")'
    );
    expect(waitlistedActions).not.toContain("approveAction");
    expect(waitlistedActions).not.toContain("manualReviewAction");
    expect(waitlistedActions).not.toContain("returnPendingAction");
    expect(compactModal).toContain('status === "waitlisted"');
    expect(compactModal).not.toContain('"Approve From Waitlist"');
    expect(compactModal).toContain(
      "A waitlisted player cannot be promoted by an administrator."
    );
    expect(compactDirectAction).toContain(
      "<form action={updateRegistrationStatusAction}"
    );
    expect(compactDirectAction).toContain(
      'name="adminNotes" value={registration.privateAdminNote ?? ""}'
    );
  });

  it("makes terminal registration notes and empty bulk approval read-only", () => {
    const compactPage = compact(adminPageSource);
    const compactModal = compact(selectedRegistrationModal);

    expect(compactPage).toContain(
      "const hasBulkApprovableRegistration = registrationReviewRows.some("
    );
    expect(compactPage).toContain(
      "disabled={!hasBulkApprovableRegistration}"
    );
    expect(compactModal).toContain(
      "readOnly={selectedRegistrationIsTerminal}"
    );
    expect(compactModal).toContain(
      "disabled={selectedRegistrationIsTerminal}"
    );
    expect(compactModal).toContain(
      "private administrator notes remain available in read-only form."
    );
    expect(compactModal).toContain(
      "registration decisions and private administrator notes are read-only."
    );
  });

  it("limits review mutations to status and the private administrator note", () => {
    const individualPayloads = registrationUpdatePayloads(
      updateRegistrationStatusAction
    );
    const bulkPayloads = registrationUpdatePayloads(
      approveSelectedRegistrationsAction
    );

    expect(individualPayloads).toEqual([]);
    expect(bulkPayloads).toEqual([]);
    expect(rpcNames(updateRegistrationStatusAction)).toEqual([
      "review_tournament_registration",
    ]);
    expect(rpcNames(approveSelectedRegistrationsAction)).toEqual([
      "review_tournament_registration",
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

  it("keeps ordinary deletion unavailable and restricts cleanup to terminal rows", () => {
    const compactDelete = compact(deleteSelectedRegistrationsAction);
    const compactPage = compact(adminPageSource);

    expect(compactPage).not.toContain("Delete Selected");
    expect(compactDelete).toContain(
      'registration.registration_status !== "rejected" && registration.registration_status !== "withdrawn"'
    );
    expect(compactDelete).toContain(
      'notice: "registration-delete-blocked"'
    );
  });

  it("does not generate, publish, or start competition as a review side effect", () => {
    const reviewActions = compact(
      `${updateRegistrationStatusAction}\n${approveSelectedRegistrationsAction}`
    );

    expect(rpcNames(updateRegistrationStatusAction)).toEqual([
      "review_tournament_registration",
    ]);
    expect(rpcNames(approveSelectedRegistrationsAction)).toEqual([
      "review_tournament_registration",
    ]);

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

  it("leaves approval notification creation to the canonical database trigger", () => {
    const compactNotifications = compact(notificationBuilder);
    const notificationCall = sliceSource(
      updateRegistrationStatusAction,
      "const notification = buildRegistrationStatusNotification({",
      "  const { error } = await supabase.rpc("
    );

    expect(compactNotifications).not.toContain("registration.approved");
    expect(compactNotifications).not.toContain("Registration Approved");
    expect(approveSelectedRegistrationsAction).not.toContain(
      "buildRegistrationStatusNotification"
    );
    expect(registrationActionsSource).not.toContain(
      "createInAppNotifications"
    );

    expect(notificationCall).not.toContain("adminNotes");
    expect(notificationCall).not.toContain("admin_notes");
  });

  it("preserves generic notifications for unrelated review states without private context", () => {
    const compactNotifications = compact(notificationBuilder);

    expect(compactNotifications).toContain(
      "Your registration for ${tournamentTitle} has been rejected."
    );
    expect(compactNotifications).toContain(
      "Your registration for ${tournamentTitle} is currently under manual review."
    );
    expect(compactNotifications).toContain(
      "You have been added to the waitlist for ${tournamentTitle}."
    );
    expect(compactNotifications).toContain(
      "eventKey: rejectionEventKey"
    );
    expect(compact(updateRegistrationStatusAction)).toContain(
      "`registration:${currentRegistration.id}:rejected:${rejectionCycle}`"
    );
    expect(compact(updateRegistrationStatusAction)).not.toContain(
      "eventKey: `registration:${registration.id}:waitlisted`"
    );
    expect(compactNotifications.toLowerCase()).not.toContain("admin_notes");
    expect(compactNotifications).not.toContain("adminNotes");
    expect(compactNotifications).not.toContain("privateAdminNote");
  });
});
