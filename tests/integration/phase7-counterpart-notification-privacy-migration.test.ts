import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const generatorMigration = compactSql(
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260808100000_matchup_deadlines_double_forfeit.sql"
    ),
    "utf8"
  )
);
const originalClosureMigration = compactSql(
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260813101000_competition_history_safe_account_closure.sql"
    ),
    "utf8"
  )
);
const correctionMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260814121000_phase7_counterpart_notification_privacy.sql"
);
const correctionMigration = existsSync(correctionMigrationPath)
  ? compactSql(readFileSync(correctionMigrationPath, "utf8"))
  : "";

function compactSql(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractFunction(source: string, functionName: string) {
  const createPattern = new RegExp(
    `create(?: or replace)? function public\\.${functionName}\\(`,
    "i"
  );
  const start = source.search(createPattern);
  expect(start).toBeGreaterThanOrEqual(0);

  const end = source.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end + 3);
}

describe("Phase 7 counterpart-notification privacy migration", () => {
  it("records the deterministic old gap without using display copy as identity", () => {
    const generator = extractFunction(
      generatorMigration,
      "create_matchup_notifications"
    );
    const originalClosure = extractFunction(
      originalClosureMigration,
      "close_ironclad_player_account"
    );
    const originalNotificationCleanup = originalClosure.slice(
      originalClosure.indexOf("delete from public.notifications as notification"),
      originalClosure.indexOf("update public.registrations")
    );

    expect(generator).toContain("when p_type = 'match.ready'");
    expect(generator).toContain("' your opponent is %s.'");
    expect(generator).toContain("'opponentname', v_recipient.opponent_name");
    expect(generator).toContain("registration.id as registration_id");
    expect(generator).toContain("opponent.player_name as opponent_name");
    expect(originalNotificationCleanup).not.toContain(
      "from public.tournament_matches as related_match"
    );
  });

  it("removes both players' ready notifications through match and registration relationships", () => {
    expect(existsSync(correctionMigrationPath)).toBe(true);

    const closeAccount = extractFunction(
      correctionMigration,
      "close_ironclad_player_account"
    );
    const notificationCleanup = closeAccount.slice(
      closeAccount.indexOf("delete from public.notifications as notification"),
      closeAccount.indexOf("update public.registrations")
    );
    const counterpartCleanup = notificationCleanup.slice(
      notificationCleanup.indexOf(
        "from public.tournament_matches as related_match"
      )
    );

    expect(counterpartCleanup).toContain(
      "notification.match_id = related_match.id"
    );
    expect(counterpartCleanup).toContain(
      "related_registration.id in ( related_match.player_one_registration_id, related_match.player_two_registration_id )"
    );
    expect(counterpartCleanup).toContain(
      "related_registration.profile_id = v_player.id"
    );
    expect(counterpartCleanup).toContain(
      "related_registration.clerk_user_id = v_clerk_user_id"
    );
    expect(counterpartCleanup).toContain("notification.type = 'match.ready'");
    expect(counterpartCleanup).not.toContain("notification.registration_id");
    expect(counterpartCleanup).not.toContain("notification.message");
    expect(counterpartCleanup).not.toContain("notification.title");
    expect(counterpartCleanup).not.toContain("notification.actor_display_name");
  });

  it("idempotently removes already-stored ready notifications for closed competitors", () => {
    const functionStart = correctionMigration.indexOf(
      "create or replace function public.close_ironclad_player_account("
    );
    const backfill = correctionMigration.slice(0, functionStart);

    expect(backfill).toContain("delete from public.notifications as notification");
    expect(backfill).toContain("notification.type = 'match.ready'");
    expect(backfill).toContain("notification.match_id = related_match.id");
    expect(backfill).toContain(
      "related_registration.id in ( related_match.player_one_registration_id, related_match.player_two_registration_id )"
    );
    expect(backfill).toContain(
      "closed_player.id = related_registration.profile_id"
    );
    expect(backfill).toContain("closed_player.account_closed_at is not null");
    expect(backfill).not.toContain("notification.message");
    expect(backfill).not.toContain("notification.title");
  });

  it("retains unrelated notifications and factual match/result history with idempotent closure semantics", () => {
    const closeAccount = extractFunction(
      correctionMigration,
      "close_ironclad_player_account"
    );
    const notificationDelete = closeAccount.indexOf(
      "delete from public.notifications as notification"
    );
    const notFoundBranch = closeAccount.indexOf("if not v_player_found then");

    expect(notificationDelete).toBeGreaterThanOrEqual(0);
    expect(notificationDelete).toBeLessThan(notFoundBranch);
    expect(closeAccount).toContain(
      "return pg_catalog.jsonb_build_object('outcome', 'not_found')"
    );
    expect(closeAccount).not.toContain("delete from public.tournament_matches");
    expect(closeAccount).not.toContain("delete from public.registrations");
    expect(closeAccount).not.toContain(
      "delete from public.match_result_submissions"
    );
    expect(closeAccount).not.toContain(
      "delete from public.match_result_report_groups"
    );
  });

  it("preserves the trusted account-closure function boundary", () => {
    const closeAccount = extractFunction(
      correctionMigration,
      "close_ironclad_player_account"
    );

    expect(closeAccount).toContain(
      "create or replace function public.close_ironclad_player_account( p_clerk_user_id text )"
    );
    expect(closeAccount).toContain("security definer");
    expect(closeAccount).toContain("set search_path = pg_catalog");
    expect(correctionMigration).toContain(
      "alter function public.close_ironclad_player_account(text) owner to postgres"
    );
    expect(correctionMigration).toContain(
      "revoke all on function public.close_ironclad_player_account(text) from public, anon, authenticated"
    );
    expect(correctionMigration).toContain(
      "grant execute on function public.close_ironclad_player_account(text) to service_role"
    );
  });
});
