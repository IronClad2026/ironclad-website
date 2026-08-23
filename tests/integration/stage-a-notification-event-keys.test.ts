import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function compact(source: string) {
  return source.replace(/\s+/g, " ").trim();
}

function sliceSource(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Missing source slice: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(start, end);
}

const notificationEvents = read("lib/notification-events.ts");
const matchActions = read("app/tournaments/match-actions.ts");
const dashboardActions = read("app/dashboard/actions.ts");
const adminPage = read("app/admin/page.tsx");
const assistanceAction = read("app/tournaments/support-actions.ts");
const stageAMigration = read(
  "supabase/migrations/20260820130000_notification_truth_reliability.sql"
);
const matchResultTrustMigration = read(
  "supabase/migrations/20260823100000_match_result_transactional_trust.sql"
);
const deadlineMigration = read(
  "supabase/migrations/20260808100000_matchup_deadlines_double_forfeit.sql"
);
const emailMigration = read(
  "supabase/migrations/20260810162000_transactional_email_notifications.sql"
);
const pollMigration = read(
  "supabase/migrations/20260817120000_polls_decisions.sql"
);

describe("Stage A canonical notification event keys", () => {
  it("gives every report-group Player outcome stable report identity", () => {
    const normalized = compact(notificationEvents);

    expect(compact(matchResultTrustMigration)).toContain(
      "'match:%s:report-group:%s:response:%s'"
    );
    expect(normalized).toContain(
      "eventKey: `match:${context.matchId}:report-group:${context.id}:review:${decision}`"
    );
    expect(normalized).toContain(
      "eventKey: `match:${context.matchId}:submission:${context.id}:review:${decision}`"
    );
    expect(compact(matchResultTrustMigration)).toContain(
      "'match:%s:report-group:%s:no-show-reported'"
    );
    expect(compact(matchActions)).toContain(
      "eventKey: `match:${match.id}:activation:${match.activation_version}:admin-official-result-approved`"
    );
  });

  it("keeps all three future Admin Push-important producers deterministic", () => {
    const disputeProducer = compact(matchResultTrustMigration);
    const assistanceProducer = compact(assistanceAction);

    expect(disputeProducer).toContain(
      "when new.result_type = 'no_show' then 'match.no_show_disputed' else 'match.dispute_opened'"
    );
    expect(disputeProducer).toContain(
      "'match:%s:report-group:%s:dispute-opened'"
    );
    expect(compact(matchActions)).not.toContain(
      "await notifyadminsofmatchdispute("
    );
    expect(compact(matchActions)).not.toContain(
      "await notifynoshowreporterofresponse("
    );
    expect(compact(dashboardActions)).not.toContain(
      "await notifyadminsofmatchdispute("
    );
    expect(compact(dashboardActions)).not.toContain(
      "await notifynoshowreporterofresponse("
    );
    expect(assistanceProducer).toContain(
      'type: "match.admin_assistance_requested"'
    );
    expect(assistanceProducer).toContain(
      "const requestCycle = previousRequest ? `after:${previousRequest.id}` : \"initial\""
    );
    expect(assistanceProducer).toContain(
      "`match:${input.matchId}:registration:${registrationData.id}:` + `admin-assistance-request:${requestCycle}`"
    );
    expect(assistanceProducer).toContain("eventKey,");
  });

  it("does not add event keys to the two Admin in-site-only producers", () => {
    const resultSubmitted = compact(
      sliceSource(
        matchActions,
        "const notificationCreated = committed.reconciled",
        "if (!notificationCreated)"
      )
    );

    expect(resultSubmitted).toContain('type: "match.result_submitted"');
    expect(resultSubmitted).not.toContain("eventKey");
    expect(stageAMigration).not.toContain("registration.submitted");
  });

  it("stabilizes registration and waitlist lifecycle events without free text", () => {
    const registrationBuilder = compact(
      sliceSource(
        adminPage,
        "function buildRegistrationStatusNotification(",
        "async function updateRegistrationStatus("
      )
    );
    const assignmentTrigger = compact(
      sliceSource(
        stageAMigration,
        "create or replace function public.assign_canonical_notification_event_key()",
        "create unique index if not exists"
      )
    );

    expect(registrationBuilder).toContain(
      "eventKey: rejectionEventKey"
    );
    expect(compact(adminPage)).toContain(
      "const rejectionCycle = previousRejection ? `after:${previousRejection.id}` : \"initial\""
    );
    expect(compact(adminPage)).toContain(
      "`registration:${currentRegistration.id}:rejected:${rejectionCycle}`"
    );
    expect(registrationBuilder).not.toMatch(/eventKey:[^}]*adminNotes/);
    expect(assignmentTrigger).toContain(
      "'registration:%s:waitlist-offer', new.registration_id"
    );
    expect(assignmentTrigger).toContain(
      "'registration:%s:waitlist-closed', new.registration_id"
    );
  });

  it("preserves already-stable approval, Match, deadline, Poll, and terminal conventions", () => {
    expect(emailMigration).toContain(
      "'registration:%s:approved'"
    );
    expect(compact(deadlineMigration)).toContain(
      "v_event_key := format( 'match:%s:%s'"
    );
    for (const type of [
      "match.ready",
      "match.automatic_advance",
      "match.deadline_updated",
      "match.deadline_reminder",
      "match.deadline_ruling",
    ]) {
      expect(deadlineMigration).toContain(`'${type}'`);
    }
    expect(pollMigration).toContain("'poll:%s:published'");
    expect(pollMigration).toContain("'poll:%s:decision-published'");
    expect(notificationEvents).toContain(
      "eventKey: `tournament:${tournamentId}:registration:${registration.id}:${outcome}`"
    );
  });
});
