import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260820130000_notification_truth_reliability.sql"
  ),
  "utf8"
).replace(/\r\n?/g, "\n");
const functionFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260820131000_fix_notification_truth_nullif.sql"
  ),
  "utf8"
).replace(/\r\n?/g, "\n");
const transactionalEmailMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810162000_transactional_email_notifications.sql"
  ),
  "utf8"
).replace(/\r\n?/g, "\n");

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

const eventKeyTrigger = sliceSource(
  migration,
  "create or replace function public.assign_canonical_notification_event_key()",
  "create unique index if not exists"
);
const adminUniqueIndex = sliceSource(
  migration,
  "create unique index if not exists",
  "create or replace function\n  public.sync_match_confirmation_required_notification()"
);
const confirmationFunction = sliceSource(
  functionFixMigration,
  "create or replace function\n  public.sync_match_confirmation_required_notification()",
  "alter function public.sync_match_confirmation_required_notification()"
);

describe("Stage A notification-truth migration", () => {
  it("is one forward-only transaction without destructive data rewrites", () => {
    const normalized = compact(migration).toLowerCase();

    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).not.toMatch(/\bdrop\s+table\b/);
    expect(normalized).not.toMatch(/\btruncate\b/);
    expect(normalized).not.toMatch(/\bdelete\s+from\b/);
    expect(normalized).not.toContain("push_subscription");
    expect(normalized).not.toContain("vapid");
    expect(normalized).not.toContain("service worker");
    expect(normalized).not.toContain("appbadge");
  });

  it("preserves the Staging-discovered trigger fix as a forward-only migration", () => {
    const normalized = compact(functionFixMigration).toLowerCase();
    const normalizedFunction = compact(confirmationFunction).toLowerCase();

    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).toContain(
      "create or replace function public.sync_match_confirmation_required_notification()"
    );
    expect(normalizedFunction).not.toContain("pg_catalog.nullif");
    expect(normalizedFunction).not.toContain("pg_catalog.coalesce");
    expect(normalized).toContain(
      "alter function public.sync_match_confirmation_required_notification() owner to postgres;"
    );
    expect(normalized).toContain(
      "revoke all on function public.sync_match_confirmation_required_notification()"
    );
    expect(normalized).not.toContain("push_subscription");
  });

  it("assigns deterministic waitlist event keys before existing insert policies", () => {
    const normalized = compact(eventKeyTrigger);

    expect(normalized).toContain(
      "if new.event_key is not null or new.registration_id is null then return new;"
    );
    expect(normalized).toContain("new.type = 'registration.waitlist_offer'");
    expect(normalized).toContain(
      "'registration:%s:waitlist-offer', new.registration_id"
    );
    expect(normalized).toContain("new.type = 'registration.waitlist_closed'");
    expect(normalized).toContain(
      "'registration:%s:waitlist-closed', new.registration_id"
    );
    expect(normalized).toContain(
      "create trigger notifications_assign_canonical_event_key before insert on public.notifications"
    );
  });

  it("deduplicates every launch Push-important role-targeted Admin event", () => {
    const normalized = compact(adminUniqueIndex);

    expect(normalized).toContain(
      "on public.notifications(recipient_role, event_key)"
    );
    expect(normalized).toContain("recipient_role = 'admin'");
    expect(normalized).toContain("recipient_clerk_user_id is null");
    expect(normalized).toContain("event_key is not null");
    expect(normalized).toContain(
      "'match.dispute_opened', 'match.no_show_disputed', 'match.admin_assistance_requested'"
    );
    expect(normalized).not.toContain("registration.submitted");
    expect(normalized).not.toContain("match.result_submitted");
  });

  it("creates confirmation truth only for a normal pending report group", () => {
    const normalized = compact(confirmationFunction);

    expect(normalized).toContain(
      "if new.result_type is distinct from 'normal' then return new;"
    );
    expect(normalized).toContain(
      "new.status is distinct from 'pending_confirmation' or new.finalized_at is not null"
    );
    expect(normalized).toContain("submitter.id = new.submitted_by_registration_id");
    expect(normalized).toContain("opponent.id = new.opponent_registration_id");
    expect(normalized).toContain("submitter.id <> opponent.id");
    expect(normalized).toContain(
      "v_recipient_clerk_user_id = new.submitted_by_clerk_user_id then return new;"
    );
    expect(normalized).toContain("'match.confirmation_required'");
    expect(normalized).toContain(
      "'match:%s:report-group:%s:confirmation-required', new.match_id, new.id"
    );
    expect(normalized).toContain("registration_id, match_id, report_group_id");
    expect(normalized).toContain(
      "on conflict (recipient_clerk_user_id, event_key) where event_key is not null do nothing;"
    );
  });

  it("persists and resolves the canonical row in report-group transactions", () => {
    const normalizedMigration = compact(migration);
    const normalizedFunction = compact(confirmationFunction);

    expect(normalizedMigration).toContain(
      "create trigger match_result_report_groups_create_confirmation_notification after insert on public.match_result_report_groups"
    );
    expect(normalizedMigration).toContain(
      "create trigger match_result_report_groups_resolve_confirmation_notification after update of status, finalized_at on public.match_result_report_groups"
    );
    expect(normalizedFunction).toContain(
      "old.status is distinct from 'pending_confirmation'"
    );
    expect(normalizedFunction).toContain(
      "set read_at = coalesce( notification.read_at, pg_catalog.clock_timestamp() )"
    );
    expect(normalizedFunction).toContain(
      "notification.report_group_id = new.id"
    );
  });

  it("keeps both trigger functions postgres-owned and non-callable", () => {
    const normalized = compact(migration);

    for (const functionName of [
      "assign_canonical_notification_event_key",
      "sync_match_confirmation_required_notification",
    ]) {
      expect(normalized).toContain(
        `alter function public.${functionName}() owner to postgres;`
      );
      expect(normalized).toContain(
        `revoke all on function public.${functionName}()`
      );
    }
    expect(normalized.match(/security definer/g)).toHaveLength(2);
    expect(normalized.match(/set search_path = pg_catalog/g)).toHaveLength(2);
  });

  it("does not make confirmation-required notifications email eligible", () => {
    const initializer = sliceSource(
      transactionalEmailMigration,
      "create or replace function public.initialize_transactional_email_state()",
      "alter function public.initialize_transactional_email_state()"
    );

    expect(initializer).not.toContain("match.confirmation_required");
    expect(migration).not.toContain("email_template_key");
    expect(migration).not.toContain("email_delivery_status");
    expect(migration).not.toContain("email_next_attempt_at");
    expect(functionFixMigration).not.toContain("email_template_key");
    expect(functionFixMigration).not.toContain("email_delivery_status");
    expect(functionFixMigration).not.toContain("email_next_attempt_at");
  });
});
