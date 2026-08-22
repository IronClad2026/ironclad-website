import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260821120000_web_push_notifications.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const correctionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260821121000_fix_web_push_greatest.sql"
  ),
  "utf8"
);

function functionBody(name: string, source = migration) {
  const match = source.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i"
    )
  );
  expect(match, `${name} must exist`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("Stage B Web Push migration", () => {
  it("creates only the minimal account-owned secret subscription model", () => {
    const table = migration.match(
      /create table public\.push_subscriptions[\s\S]*?\n\);/
    )?.[0];
    expect(table).toBeTruthy();
    expect(table).toContain("owner_clerk_user_id text not null");
    expect(table).toContain("endpoint text not null");
    expect(table).toContain("p256dh text not null");
    expect(table).toContain("auth text not null");
    expect(table).toContain("expires_at timestamptz");
    expect(table).toContain("unique (endpoint)");
    expect(table).not.toMatch(/role|fingerprint|ip_address|user_agent|analytics/i);
  });

  it("keeps browser roles away from secret rows and RPCs", () => {
    expect(migration).toContain(
      "alter table public.push_subscriptions enable row level security"
    );
    expect(migration).toMatch(
      /revoke all on table public\.push_subscriptions\s+from public, anon, authenticated;/
    );
    expect(migration).not.toMatch(
      /create policy[\s\S]*?push_subscriptions/i
    );
    for (const name of [
      "upsert_web_push_subscription",
      "delete_web_push_subscription",
      "claim_web_push_notifications",
      "complete_web_push_notification",
    ]) {
      expect(functionBody(name)).toContain(
        "coalesce(auth.role(), '') <> 'service_role'"
      );
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role;`,
          "i"
        )
      );
    }
  });

  it("enforces endpoint ownership, provider restrictions, idempotency, and the ten-device cap", () => {
    const upsert = functionBody("upsert_web_push_subscription");
    expect(upsert).toContain("pg_advisory_xact_lock");
    expect(upsert).toContain("hashtextextended(v_clerk_user_id, 0)");
    expect(upsert).toContain("v_existing.owner_clerk_user_id <> v_clerk_user_id");
    expect(upsert).toContain("where subscription.endpoint = v_endpoint");
    expect(upsert).toContain(") >= 10 then");
    expect(upsert).toMatch(/fcm\\\.googleapis/);
    expect(upsert).toMatch(/push\\\.services\\\.mozilla/);
    expect(upsert).toMatch(/push\\\.apple/);
    expect(upsert).toMatch(/notify\\\.windows/);

    const deletion = functionBody("delete_web_push_subscription");
    expect(deletion).toContain(
      "subscription.owner_clerk_user_id = v_clerk_user_id"
    );
    expect(deletion).toContain("subscription.endpoint = v_endpoint");
  });

  it("preserves the deployed upsert contract while fixing schema-qualified GREATEST forward-only", () => {
    const deployed = functionBody("upsert_web_push_subscription");
    const corrected = functionBody(
      "upsert_web_push_subscription",
      correctionMigration
    );

    expect(deployed).toContain("pg_catalog.greatest(");
    expect(corrected).not.toContain("pg_catalog.greatest(");
    expect(corrected).toContain("updated_at = greatest(");
    expect(corrected).toContain(
      "v_existing.owner_clerk_user_id <> v_clerk_user_id"
    );
    expect(corrected).toContain("pg_advisory_xact_lock");
    expect(correctionMigration.trimStart()).toMatch(/^begin;/);
    expect(correctionMigration.trimEnd()).toMatch(/commit;$/);
  });

  it("deletes every account endpoint inside the existing trusted closure transaction", () => {
    expect(migration).toContain(
      "rename to close_ironclad_player_account_without_push_cleanup"
    );
    const closure = functionBody("close_ironclad_player_account");
    expect(closure).toContain(
      "delete from public.push_subscriptions as subscription"
    );
    expect(closure).toContain(
      "subscription.owner_clerk_user_id = v_clerk_user_id"
    );
    expect(closure).toContain(
      "public.close_ironclad_player_account_without_push_cleanup"
    );
  });

  it("enrolls only new stable-key approved notifications without a historical backfill", () => {
    expect(migration).not.toMatch(
      /update public\.notifications[\s\S]{0,240}push_enqueued_at\s*=\s*clock_timestamp\(\)/i
    );
    expect(migration).not.toMatch(/insert into public\.notifications/i);
    expect(migration).toContain(
      "create trigger notifications_initialize_web_push_state"
    );
    expect(migration).toContain("before insert on public.notifications");
    const initialize = functionBody("initialize_web_push_state");
    expect(initialize).toContain("nullif(btrim(new.event_key), '') is null");
    expect(initialize).toContain("new.push_enqueued_at := v_now");
    expect(initialize).not.toContain("registration.submitted");
    expect(initialize).not.toContain("match.result_submitted");
    expect(initialize).not.toContain("registration.waitlisted");
    expect(initialize).not.toContain("registration.manual_review");
    expect(initialize).toContain("new.metadata ->> 'purpose' = 'tournament_decision'");
  });

  it("locks the role-targeted Admin policy to exactly three types", () => {
    const initialize = functionBody("initialize_web_push_state");
    const adminBranch = initialize.match(
      /if new\.recipient_role = 'admin'[\s\S]*?v_eligible := true;/
    )?.[0];
    expect(adminBranch?.match(/'match\.[^']+'/g)?.sort()).toEqual([
      "'match.admin_assistance_requested'",
      "'match.dispute_opened'",
      "'match.no_show_disputed'",
    ]);
  });

  it("uses a bounded independent claim lease and retry schedule", () => {
    const claim = functionBody("claim_web_push_notifications");
    expect(claim).toContain("for update of notification skip locked");
    expect(claim).toContain("interval '10 minutes'");
    expect(claim).toContain("notification.push_attempt_count < 5");
    expect(claim).toContain("notification.read_at is null");
    expect(claim).toContain("notification.in_app_hidden_at is null");

    const complete = functionBody("complete_web_push_notification");
    expect(complete).toContain("when 1 then interval '5 minutes'");
    expect(complete).toContain("when 2 then interval '15 minutes'");
    expect(complete).toContain("when 3 then interval '30 minutes'");
    expect(complete).toContain("else interval '2 hours'");
    expect(complete).toContain("v_attempt_count >= 5");
  });

  it("keeps Push and transactional-email state independent and immutable to clients", () => {
    const claim = functionBody("claim_web_push_notifications");
    const complete = functionBody("complete_web_push_notification");
    expect(claim).not.toMatch(/email_/i);
    expect(complete).not.toMatch(/email_/i);
    const guard = functionBody("protect_notification_client_mutation");
    for (const column of [
      "push_delivery_status",
      "push_attempt_count",
      "push_next_attempt_at",
      "push_claim_token",
      "push_claim_expires_at",
      "push_enqueued_at",
      "push_completed_at",
      "push_last_error_code",
    ]) {
      expect(guard).toContain(column);
    }
  });

  it("does not add a new cron, queue service, Push provider, or Stage C secret", () => {
    expect(migration).not.toMatch(/cron\.schedule|pg_net|firebase|onesignal|pusher|ably/i);
    expect(migration).not.toMatch(/vapid|private_key|service_worker/i);
  });
});
