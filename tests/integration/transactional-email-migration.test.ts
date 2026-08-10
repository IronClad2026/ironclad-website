import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260810162000_transactional_email_notifications.sql";
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations",
  migrationName
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

const emailFields = [
  "email_template_key",
  "email_delivery_status",
  "email_attempt_count",
  "email_next_attempt_at",
  "email_claim_token",
  "email_claim_expires_at",
  "email_sent_at",
  "email_last_error_code",
  "email_provider_message_id",
] as const;

const templateKeys = [
  "registration_approved",
  "division_started_first_match",
  "later_round_match_ready",
  "deadline_reminder_72h",
  "deadline_reminder_24h",
] as const;

const deliveryStatuses = [
  "pending",
  "processing",
  "sent",
  "skipped",
  "retryable_failure",
  "permanent_failure",
] as const;

function extractFunction(functionName: string) {
  const marker = new RegExp(
    `create(?: or replace)? function (?:public|ironclad_private)\\.${functionName}\\(`
  );
  const match = marker.exec(compactMigration);
  const createIndex = match?.index ?? -1;
  const endIndex = compactMigration.indexOf("$$;", createIndex);

  if (createIndex < 0 || endIndex < 0) {
    throw new Error(
      `${functionName} was not found in ${migrationName}.`
    );
  }

  return compactMigration.slice(createIndex, endIndex + 3);
}

function valuesAllowedByCheck(columnName: string) {
  const match = compactMigration.match(
    new RegExp(`${columnName}\\s+in\\s*\\(([^)]*)\\)`)
  );

  if (!match) {
    throw new Error(`${columnName} does not have an IN-list constraint.`);
  }

  return [...match[1].matchAll(/'([^']+)'/g)]
    .map((value) => value[1])
    .sort();
}

function countMatches(value: string, expression: RegExp) {
  return [...value.matchAll(expression)].length;
}

describe("transactional-email migration contract", () => {
  it("is one transactional migration ordered after the current schema head", () => {
    expect(migrationName > "20260810100000_harden_matchup_core_search_paths.sql")
      .toBe(true);
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
  });

  it("adds exactly the nine private email-delivery fields", () => {
    const addedEmailFields = [
      ...compactMigration.matchAll(
        /add column if not exists (email_[a-z0-9_]+)/g
      ),
    ].map((match) => match[1]);

    expect(new Set(addedEmailFields)).toEqual(new Set(emailFields));
    expect(addedEmailFields).toHaveLength(emailFields.length);
    expect(compactMigration).not.toContain("recipient_email");
    expect(compactMigration).not.toContain("email_body");
    expect(compactMigration).not.toContain("provider_response");
    expect(compactMigration).not.toContain("channel text");
  });

  it("allows only the five templates and six delivery states", () => {
    expect(valuesAllowedByCheck("email_template_key")).toEqual(
      [...templateKeys].sort()
    );
    expect(valuesAllowedByCheck("email_delivery_status")).toEqual(
      [...deliveryStatuses].sort()
    );
  });

  it("enforces paired state, bounded attempts, leases, terminal state, and bounded identifiers", () => {
    const firstEmailColumn = compactMigration.indexOf(
      "add column if not exists email_template_key"
    );
    const firstEmailIndex = compactMigration.indexOf(
      "create index if not exists",
      firstEmailColumn
    );
    const constraintSection = compactMigration.slice(
      firstEmailColumn,
      firstEmailIndex
    );

    expect(constraintSection).toContain("email_attempt_count");
    expect(constraintSection).toContain("default 0");
    expect(constraintSection).toMatch(
      /email_attempt_count\s+between\s+0\s+and\s+5/
    );
    expect(constraintSection).toContain("email_template_key is null");
    expect(constraintSection).toContain("email_delivery_status is null");
    expect(constraintSection).toContain("email_template_key is not null");
    expect(constraintSection).toContain("email_delivery_status is not null");
    expect(constraintSection).toMatch(
      /email_(?:template_key|delivery_status) is not null[^;]+email_attempt_count is not null/
    );
    expect(constraintSection).toContain("email_claim_token is not null");
    expect(constraintSection).toContain("email_claim_expires_at is not null");
    expect(constraintSection).toContain("email_claim_token is null");
    expect(constraintSection).toContain("email_claim_expires_at is null");
    expect(constraintSection).toContain("email_next_attempt_at is not null");
    expect(constraintSection).toContain("email_next_attempt_at is null");
    expect(constraintSection).toContain("email_sent_at is not null");
    expect(constraintSection).toMatch(
      /email_delivery_status in \(\s*'pending',\s*'retryable_failure'\s*\)[^;]+email_next_attempt_at is not null/
    );
    expect(constraintSection).toMatch(
      /email_delivery_status in \(\s*'skipped',\s*'permanent_failure'\s*\) and email_next_attempt_at is null/
    );
    expect(constraintSection).toMatch(
      /length\(email_last_error_code\)\s*<=\s*\d+/
    );
    expect(constraintSection).toMatch(
      /length\(email_provider_message_id\)\s*<=\s*\d+/
    );

    // Lease freshness is enforced while claiming, not in a time-volatile CHECK.
    expect(constraintSection).not.toMatch(
      /(now\(\)|clock_timestamp\(\)|current_timestamp)/
    );
  });

  it("adds only the due-work and expired-lease partial indexes", () => {
    const notificationIndexes = [
      ...compactMigration.matchAll(
        /create index if not exists ([a-z0-9_]+) on public\.notifications\s*\(([^)]+)\)\s*where\s*([^;]+);/g
      ),
    ].map((match) => ({
      name: match[1],
      columns: match[2],
      predicate: match[3],
    }));
    const emailIndexes = notificationIndexes.filter(
      (index) =>
        index.columns.includes("email_") || index.predicate.includes("email_")
    );

    expect(emailIndexes).toHaveLength(2);

    const dueIndex = emailIndexes.find((index) =>
      index.columns.includes("email_next_attempt_at")
    );
    expect(dueIndex?.columns).toMatch(/email_next_attempt_at\s*,\s*id/);
    expect(dueIndex?.predicate).toContain("email_delivery_status");
    expect(dueIndex?.predicate).toContain("'pending'");
    expect(dueIndex?.predicate).toContain("'retryable_failure'");

    const leaseIndex = emailIndexes.find((index) =>
      index.columns.includes("email_claim_expires_at")
    );
    expect(leaseIndex?.columns).toMatch(/email_claim_expires_at\s*,\s*id/);
    expect(leaseIndex?.predicate).toContain(
      "email_delivery_status = 'processing'"
    );
  });

  it("creates one canonical registration-approved event inside the status transaction", () => {
    const registrationEvent = extractFunction(
      "create_registration_approved_notification"
    );

    expect(registrationEvent).toContain("new.registration_status = 'approved'");
    expect(registrationEvent).toContain("old.registration_status");
    expect(registrationEvent).toContain("is distinct from 'approved'");
    expect(registrationEvent).toContain("insert into public.notifications");
    expect(registrationEvent).toContain("'registration.approved'");
    expect(registrationEvent).toMatch(
      /format\(\s*'registration:%s:approved',\s*new\.id\s*\)/
    );
    expect(registrationEvent).toContain(
      "on conflict (recipient_clerk_user_id, event_key)"
    );
    expect(registrationEvent).toContain("do nothing");
    expect(registrationEvent).not.toContain("admin_notes");

    expect(compactMigration).toContain(
      "after update of registration_status on public.registrations"
    );
    expect(compactMigration).toContain(
      "execute function public.create_registration_approved_notification()"
    );
  });

  it("initializes only canonical new notification inserts and never backfills history", () => {
    const initializer = extractFunction(
      "initialize_transactional_email_state"
    );

    expect(compactMigration).toContain(
      "before insert on public.notifications"
    );
    expect(compactMigration).toContain(
      "execute function public.initialize_transactional_email_state()"
    );
    expect(initializer).toContain("new.event_key");
    expect(initializer).toMatch(
      /nullif\(\s*btrim\(new\.event_key\),\s*''\s*\) is null/
    );
    expect(initializer).toContain("new.email_template_key := null");
    expect(initializer).toContain("new.email_delivery_status := null");
    expect(initializer).toContain("new.email_delivery_status := 'pending'");
    expect(initializer).toContain("new.email_next_attempt_at");

    // Completion/claim updates are expected; template initialization by UPDATE is not.
    expect(compactMigration).not.toMatch(
      /update public\.notifications(?: as [a-z0-9_]+)? set email_template_key/
    );
  });

  it("closes the approval rollout gap without making legacy null-key rows eligible", () => {
    const registrationEvent = extractFunction(
      "create_registration_approved_notification"
    );
    const initializer = extractFunction(
      "initialize_transactional_email_state"
    );
    const nullKeyGuard = initializer.indexOf(
      "nullif(btrim(new.event_key), '') is null"
    );
    const approvalMapping = initializer.indexOf(
      "new.type = 'registration.approved'"
    );

    expect(registrationEvent).toMatch(
      /format\(\s*'registration:%s:approved',\s*new\.id\s*\)/
    );
    expect(registrationEvent).toContain("on conflict");
    expect(registrationEvent).toContain("do nothing");
    expect(nullKeyGuard).toBeGreaterThan(-1);
    expect(nullKeyGuard).toBeLessThan(approvalMapping);
    expect(initializer).toContain(
      "v_template_key := 'registration_approved'"
    );
    expect(initializer).toContain("new.email_delivery_status := 'pending'");
  });

  it("maps only exact canonical registration, ready, and reminder identities", () => {
    const initializer = extractFunction(
      "initialize_transactional_email_state"
    );

    for (const templateKey of templateKeys) {
      expect(initializer).toContain(`'${templateKey}'`);
    }

    expect(initializer).toContain("new.type = 'registration.approved'");
    expect(initializer).toMatch(
      /format\(\s*'registration:%s:approved',\s*new\.registration_id\s*\)/
    );
    expect(initializer).toContain("new.type = 'match.ready'");
    expect(initializer).toMatch(
      /format\(\s*'match:%s:activation:%s:ready'/
    );
    expect(initializer).toContain("activationversion");
    expect(initializer).toContain("round_number");
    expect(initializer).toContain(
      "new.type in ('match.ready', 'match.deadline_reminder')"
    );
    expect(initializer).toContain("reminderordinal");
    expect(initializer).toMatch(
      /format\(\s*'match:%s:activation:%s:reminder:%s'/
    );
    expect(initializer).toContain("= 1");
    expect(initializer).toContain("= 2");

    // Display copy must never be used as the event classifier.
    expect(initializer).not.toContain("new.title");
    expect(initializer).not.toContain("new.message");
    expect(initializer).not.toContain(" ilike ");
  });

  it("fails closed when canonical match metadata is missing", () => {
    const initializer = extractFunction(
      "initialize_transactional_email_state"
    );

    expect(initializer).toContain("new.tournament_id is not null");
    for (const metadataKey of [
      "tournamentid",
      "bracketid",
      "matchid",
      "activationversion",
      "roundnumber",
      "activatedat",
      "deadlineat",
    ]) {
      expect(initializer).toMatch(
        new RegExp(
          `new\\.metadata\\s*->\\s*'${metadataKey}'\\s+is distinct from`
        )
      );
    }
    expect(initializer).toMatch(
      /new\.metadata\s*->>\s*'deadlineevent'\s+is distinct from/
    );
    expect(initializer).not.toMatch(
      /new\.metadata\s*->>?\s*'[^']+'\s*<>/
    );
  });

  it("excludes reopened and derived matches while using authoritative round state", () => {
    const initializer = extractFunction(
      "initialize_transactional_email_state"
    );

    expect(initializer).toContain("from public.tournament_matches");
    expect(initializer).toContain("public.bracket_rounds");
    expect(initializer).toContain(
      "v_match.player_one_registration_id is null"
    );
    expect(initializer).toContain(
      "v_match.player_two_registration_id is null"
    );
    expect(initializer).toContain("v_match.outcome_type is not null");
    expect(initializer).toContain("v_match.deadline_ruled_at is not null");
    expect(initializer).toContain("launched_at is not null");
    expect(initializer).toContain("reopened");
    expect(initializer).toContain("v_match.activation_version <> 1");
    expect(initializer).toContain("round_number = 1");
    expect(initializer).toMatch(
      /max\(\s*(?:[a-z0-9_]+\.)?round_number\s*\)/
    );
    expect(initializer).not.toContain("'semifinal'");
    expect(initializer).not.toContain("'final'");
    expect(initializer).not.toContain("match.automatic_advance");
    expect(initializer).not.toContain("match.deadline_ruling");
  });

  it("loads the authoritative match as one composite value", () => {
    const initializer = extractFunction(
      "initialize_transactional_email_state"
    );

    expect(initializer).toMatch(
      /select tournament_match\s*,\s*round\.round_number/
    );
    expect(initializer).not.toContain("select tournament_match.*");
  });

  it("claims at most ten due rows deterministically with unique ten-minute leases", () => {
    const claim = extractFunction(
      "claim_transactional_email_notifications"
    );

    expect(claim).toMatch(
      /least\(\s*coalesce\(\s*p_limit,\s*10\s*\),\s*10\s*\)/
    );
    expect(claim).toContain("email_delivery_status = 'processing'");
    expect(claim).toMatch(
      /email_claim_expires_at <= (?:clock_timestamp\(\)|v_[a-z0-9_]*now)/
    );
    expect(claim).toMatch(
      /email_next_attempt_at <= (?:clock_timestamp\(\)|v_[a-z0-9_]*now)/
    );
    expect(claim).toContain("clock_timestamp()");
    expect(claim).toMatch(
      /order by notification\.email_next_attempt_at\s*,\s*notification\.id/
    );
    expect(claim).toContain("for update of notification skip locked");
    expect(claim).toContain("gen_random_uuid()");
    expect(claim).toContain("interval '10 minutes'");
    expect(claim).toContain("email_attempt_count + 1");
    expect(claim).not.toContain("email_address");
    expect(claim).not.toContain("recipient_email");
  });

  it("completes by claim-token compare-and-set with fixed retries and a terminal fifth attempt", () => {
    const completion = extractFunction(
      "complete_transactional_email_notification"
    );

    expect(completion).toContain("p_notification_id");
    expect(completion).toContain("p_claim_token");
    expect(completion).toContain("email_delivery_status = 'processing'");
    expect(completion).toContain("email_claim_token = p_claim_token");
    expect(completion).toContain("email_claim_token = null");
    expect(completion).toContain("email_claim_expires_at = null");
    expect(completion).toContain("'sent'");
    expect(completion).toContain("'skipped'");
    expect(completion).toContain("'retryable_failure'");
    expect(completion).toContain("'permanent_failure'");
    expect(completion).toContain("v_attempt_count >= 5");
    expect(completion).toContain("interval '5 minutes'");
    expect(completion).toContain("interval '15 minutes'");
    expect(completion).toContain("interval '30 minutes'");
    expect(completion).toContain("interval '2 hours'");
    expect(completion).toMatch(/(not found|row_count|no active email claim)/);
  });

  it("rejects an expired lease in both completion compare-and-set checks", () => {
    const completion = extractFunction(
      "complete_transactional_email_notification"
    );
    const lockingRead = completion.indexOf(
      "select notification.email_attempt_count"
    );
    const finalUpdate = completion.indexOf(
      "update public.notifications as notification"
    );
    const expiryPredicate =
      "notification.email_claim_expires_at > v_now";

    expect(completion).toContain("v_now timestamptz");
    expect(completion).toContain("v_now := clock_timestamp()");
    expect(lockingRead).toBeGreaterThan(-1);
    expect(finalUpdate).toBeGreaterThan(lockingRead);
    expect(completion.slice(lockingRead, finalUpdate)).toContain(
      expiryPredicate
    );
    expect(completion.slice(finalUpdate)).toContain(expiryPredicate);
    expect(countMatches(completion, /email_claim_expires_at > v_now/g)).toBe(
      2
    );
  });

  it("keeps claim and completion service-role-only and invocation postgres-only", () => {
    for (const functionName of [
      "claim_transactional_email_notifications",
      "complete_transactional_email_notification",
    ]) {
      expect(compactMigration).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}\\([^;]+from public, anon, authenticated`
        )
      );
      expect(compactMigration).toMatch(
        new RegExp(
          `grant execute on function public\\.${functionName}\\([^;]+to service_role`
        )
      );
    }

    expect(compactMigration).toMatch(
      /revoke all on function (?:public|ironclad_private)\.invoke_transactional_email_worker\(\) from public, anon, authenticated, service_role/
    );
    expect(compactMigration).not.toMatch(
      /grant execute on function (?:public|ironclad_private)\.invoke_transactional_email_worker\(\) to (?:public|anon|authenticated|service_role)/
    );
  });

  it("extends the notification mutation guard and preserves table privacy", () => {
    const guard = extractFunction("protect_notification_client_mutation");

    for (const field of emailFields) {
      expect(guard).toContain(`old.${field} is distinct from new.${field}`);
    }

    expect(compactMigration).toContain(
      "revoke all privileges on table public.notifications from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant all privileges on table public.notifications to service_role"
    );
  });

  it("invokes the exact protected HTTPS route through pg_net and the two Vault secrets", () => {
    const invocation = extractFunction(
      "invoke_transactional_email_worker"
    );

    expect(compactMigration).toContain(
      "create extension if not exists pg_net with schema extensions"
    );
    expect(compactMigration).toContain(
      "create extension if not exists pg_cron with schema extensions"
    );
    expect(invocation).toContain("returns bigint");
    expect(invocation).toContain("vault.decrypted_secrets");
    const vaultSecretNames = new Set(
      [...invocation.matchAll(/'(ironclad_[a-z0-9_]+)'/g)].map(
        (match) => match[1]
      )
    );
    expect(vaultSecretNames).toEqual(
      new Set([
        "ironclad_transactional_email_worker_url",
        "ironclad_transactional_email_worker_secret",
      ])
    );
    expect(invocation).toMatch(/nullif\(\s*btrim\(/);
    expect(invocation).toContain("return null");
    expect(invocation).toContain("https://");
    expect(invocation).toContain("/api/internal/transactional-email");
    expect(invocation).toContain("?");
    expect(invocation).toContain("#");
    expect(invocation).toContain("@");
    expect(invocation).toContain("net.http_post");
    expect(invocation).toContain("authorization");
    expect(invocation).toContain("bearer ");
    expect(invocation).toContain("content-type");
    expect(invocation).toContain("application/json");
    expect(invocation).toMatch(
      /body := (?:'\{\}'::jsonb|jsonb_build_object\(\s*'source',\s*'pg_cron'\s*\))/
    );
    expect(invocation).not.toContain("notification_id");
    expect(invocation).not.toContain("recipient");
    expect(invocation).toContain("timeout_milliseconds := 70000");
    expect(invocation).not.toContain("raise notice");
    expect(invocation.indexOf("return null")).toBeLessThan(
      invocation.indexOf("net.http_post")
    );
    expect(invocation).toMatch(
      /\^https:\/\/\[\^\/\?#@\[:space:\]\]\+\/api\/internal\/transactional-email\$/
    );
  });

  it("installs one idempotent five-minute database cron job", () => {
    expect(countMatches(compactMigration, /cron\.schedule\(/g)).toBe(1);
    expect(compactMigration).toContain("cron.unschedule");
    expect(compactMigration.indexOf("cron.unschedule")).toBeLessThan(
      compactMigration.indexOf("cron.schedule")
    );
    expect(compactMigration).toContain(
      "'ironclad-transactional-email-worker'"
    );
    expect(compactMigration).toContain("'*/5 * * * *'");
    expect(compactMigration).toMatch(
      /(?:select|perform) (?:public|ironclad_private)\.invoke_transactional_email_worker\(\)/
    );
    expect(compactMigration).not.toContain("vercel cron");
    expect(compactMigration).not.toContain("cron_secret");
    expect(compactMigration).not.toContain("exception when others");
    expect(
      existsSync(resolve(process.cwd(), "vercel.json"))
    ).toBe(false);
  });
});
