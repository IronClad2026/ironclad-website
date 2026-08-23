import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260823100000_match_result_transactional_trust.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const conflictTransportMigrationPath =
  "supabase/migrations/20260823110000_match_result_conflict_transport.sql";
const conflictTransportMigration = readFileSync(
  resolve(process.cwd(), conflictTransportMigrationPath),
  "utf8"
);
const triggerMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260820130000_notification_truth_reliability.sql"
  ),
  "utf8"
);

function compact(source: string) {
  return source.replace(/\s+/g, " ").trim().toLowerCase();
}

function functionBody(marker: string) {
  const start = migration.toLowerCase().indexOf(marker.toLowerCase());
  const end = migration.indexOf("\n$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`Missing function body for ${marker}`);
  }

  return compact(migration.slice(start, end));
}

function expectOrdered(source: string, markers: string[]) {
  let previous = -1;
  for (const marker of markers) {
    const index = source.indexOf(compact(marker), previous + 1);
    expect(index, `Missing ordered marker: ${marker}`).toBeGreaterThan(previous);
    previous = index;
  }
}

describe("match-result transactional trust migration", () => {
  it("keeps the transactional core in a forward-only hardened migration", () => {
    const normalized = compact(migration);

    expect(normalized.match(/\bbegin;/g)).toHaveLength(1);
    expect(normalized.match(/\bcommit;/g)).toHaveLength(1);
    expect(normalized).not.toMatch(/\b(drop table|truncate|delete from)\b/);

    for (const signature of [
      "public.finalize_match_result_report_group( uuid, text, text, text, text )",
      "public.confirm_match_result_report_group(uuid, text)",
      "public.dispute_match_result_report_group(uuid, text, text)",
      "public.admin_finalize_match_result_report_group( uuid, text, text, text, integer, integer, uuid )",
      "public.review_match_series_result( uuid, text, text, text )",
      "public.apply_admin_official_match_result( uuid, integer, integer, uuid, text )",
      "public.auto_approve_expired_match_result_groups(integer)",
    ]) {
      expect(normalized).toContain(
        compact(`revoke all on function ${signature} from public, anon, authenticated`)
      );
      expect(normalized).toContain(
        compact(`grant execute on function ${signature} to service_role`)
      );
    }

    expect(normalized.match(/security definer/g)).toHaveLength(8);
    expect(normalized.match(/set search_path = pg_catalog/g)).toHaveLength(8);
  });

  it("translates only serialization conflicts at hardened API boundaries", () => {
    const normalized = compact(conflictTransportMigration);

    expect(conflictTransportMigrationPath.localeCompare(migrationPath)).toBe(1);
    expect(normalized.match(/\bbegin;/g)).toHaveLength(1);
    expect(normalized.match(/\bcommit;/g)).toHaveLength(1);
    expect(normalized.match(/security definer/g)).toHaveLength(5);
    expect(normalized.match(/set search_path = pg_catalog/g)).toHaveLength(5);
    expect(normalized.match(/when serialization_failure then/g)).toHaveLength(5);
    expect(normalized.match(/raise sqlstate 'pt409' using message = sqlerrm/g)).toHaveLength(5);
    expect(normalized).not.toMatch(/\b(drop table|truncate|delete from)\b/);

    for (const [apiSignature, coreCall] of [
      [
        "public.confirm_match_result_report_group_api(uuid, text)",
        "perform public.confirm_match_result_report_group(",
      ],
      [
        "public.dispute_match_result_report_group_api( uuid, text, text )",
        "perform public.dispute_match_result_report_group(",
      ],
      [
        "public.admin_finalize_match_result_report_group_api( uuid, text, text, text, integer, integer, uuid )",
        "perform public.admin_finalize_match_result_report_group(",
      ],
      [
        "public.apply_admin_official_match_result_api( uuid, integer, integer, uuid, text )",
        "perform public.apply_admin_official_match_result(",
      ],
      [
        "public.review_match_series_result_api( uuid, text, text, text )",
        "perform public.review_match_series_result(",
      ],
    ]) {
      expect(normalized).toContain(compact(coreCall));
      expect(normalized).toContain(
        compact(`revoke all on function ${apiSignature} from public, anon, authenticated`)
      );
      expect(normalized).toContain(
        compact(`grant execute on function ${apiSignature} to service_role`)
      );
    }
  });

  it("uses Match-first locking and explicit stale conflicts for competing paths", () => {
    const finalizer = functionBody(
      "create or replace function public.finalize_match_result_report_group("
    );
    const confirmation = functionBody(
      "create or replace function public.confirm_match_result_report_group("
    );
    const dispute = functionBody(
      "create or replace function public.dispute_match_result_report_group("
    );
    const adminReview = functionBody(
      "create or replace function public.admin_finalize_match_result_report_group("
    );

    for (const source of [finalizer, confirmation, dispute, adminReview]) {
      expectOrdered(source, [
        "from public.tournament_matches as match",
        "for update",
        "from public.match_result_report_groups as report_group",
        "for update",
      ]);
      expect(source).toContain("errcode = '40001'");
      expect(source).toContain("match result conflict:");
    }

    expectOrdered(finalizer, [
      "from public.tournament_matches as match",
      "from public.match_result_report_groups as report_group",
      "from public.match_result_submissions as submission",
      "perform public.apply_official_match_result(",
    ]);
    expect(finalizer).toContain("get diagnostics v_affected = row_count");
    expect(finalizer).toContain("if v_affected <> 1 then");

    expect(adminReview).toContain("v_group.finalized_at is not null");
    expect(adminReview).toContain(
      "v_group.status not in ( 'pending_confirmation', 'disputed', 'under_review' )"
    );
    expect(adminReview).toContain(
      "v_active_group_id is distinct from v_group.id"
    );
    expect(adminReview).toContain("get diagnostics v_affected = row_count");
  });

  it("refuses a direct official result when an active group wins the Match lock", () => {
    const directResult = functionBody(
      "create or replace function public.apply_admin_official_match_result("
    );

    expectOrdered(directResult, [
      "from public.tournament_matches as match",
      "for update",
      "from public.match_result_report_groups as report_group",
      "for update",
      "if v_active_group_id is not null then",
      "adjudicate the active report group",
      "from public.match_result_submissions as submission",
      "perform public.apply_official_match_result(",
    ]);
    expect(directResult).toContain("get diagnostics v_affected = row_count");
    expect(directResult).toContain("if v_affected <> 1 then");
  });

  it("serializes the historical ungrouped review on Match before Submission", () => {
    const legacyReview = functionBody(
      "create or replace function public.review_match_series_result("
    );

    expectOrdered(legacyReview, [
      "select submission.match_id",
      "from public.tournament_matches as match",
      "for update",
      "select submission.*",
      "from public.match_result_submissions as submission",
      "for update",
      "perform public.review_match_series_result_without_deadline_restore(",
    ]);
    expect(legacyReview).toContain("errcode = '40001'");
  });

  it("makes mandatory no-show and dispute notifications part of the transition", () => {
    const trigger = functionBody(
      "create or replace function\n  public.sync_match_confirmation_required_notification()"
    );

    for (const type of [
      "match.confirmation_required",
      "match.no_show_reported",
      "match.dispute_opened",
      "match.no_show_disputed",
      "match.no_show_confirmed",
    ]) {
      expect(trigger).toContain(`'${type}'`);
    }

    for (const keySuffix of [
      "confirmation-required",
      "no-show-reported",
      "dispute-opened",
    ]) {
      expect(trigger).toContain(keySuffix);
    }
    expect(trigger).toContain("'match:%s:report-group:%s:response:%s'");
    expect(trigger).toContain(
      "case when new.status = 'confirmed' then 'confirmed' else 'disputed' end"
    );

    expect(trigger).toContain("update public.notifications as notification");
    expect(trigger).toContain("set read_at = coalesce(");
    expect(trigger).toContain("notification.report_group_id = new.id");
    expect(trigger).toContain(
      "on conflict (recipient_clerk_user_id, event_key) where event_key is not null do nothing"
    );
    expect(compact(triggerMigration)).toContain(
      "create trigger match_result_report_groups_create_confirmation_notification after insert on public.match_result_report_groups for each row execute function public.sync_match_confirmation_required_notification()"
    );
    expect(compact(triggerMigration)).toContain(
      "create trigger match_result_report_groups_resolve_confirmation_notification after update of status, finalized_at on public.match_result_report_groups for each row execute function public.sync_match_confirmation_required_notification()"
    );
    expect(migration).not.toContain("notification_email_deliveries");
  });

  it("keeps cron candidate discovery unlocked and revalidates in the finalizer", () => {
    const cron = functionBody(
      "create or replace function public.auto_approve_expired_match_result_groups("
    );
    const candidateLoop = cron.slice(0, cron.indexOf("loop"));

    expect(candidateLoop).not.toContain("skip locked");
    expect(candidateLoop).not.toContain("for update");
    expect(cron).toContain("perform public.finalize_match_result_report_group(");
    expect(cron).toContain("when serialization_failure then");
    expectOrdered(cron, [
      "from public.tournament_matches as match",
      "for update",
      "from public.match_result_report_groups as report_group",
      "for update",
    ]);
  });
});
