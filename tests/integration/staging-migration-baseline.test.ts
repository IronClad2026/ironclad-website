import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_MIGRATION,
  HISTORICAL_RECORDS,
  MEMBER_RPC_MIGRATION,
  STAGING_PROJECT_REF,
  compareStagingMigrationBaseline,
  migrationSourceSha256,
  type ApprovedPendingMigration,
  type LocalMigration,
  type RemoteMigration,
} from "@/scripts/migrations/staging-migration-baseline";

const root = process.cwd();
const archiveDirectory = "docs/staging-migration-history";
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const archives = HISTORICAL_RECORDS.map((pin) =>
  JSON.parse(read(archiveDirectory + "/" + pin.version + ".json")) as RemoteMigration & { statements: string[] }
);
const localMigrations: LocalMigration[] = readdirSync(resolve(root, "supabase/migrations"))
  .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
  .sort()
  .map((file) => ({
    version: file.slice(0, 14),
    name: file.slice(15, -4),
    sql: read("supabase/migrations/" + file),
  }));

// Ordinary records below are synthetic snapshot data, not a live database attestation.
function snapshot() {
  return {
    projectRef: STAGING_PROJECT_REF,
    localMigrations: localMigrations.map((record) => ({ ...record })),
    remoteMigrations: [
      ...localMigrations
        .filter((record) => record.version !== CANONICAL_MIGRATION.version)
        .map((record) => ({
          version: record.version,
          name: record.name,
          statements: [record.sql],
        })),
      ...archives.map((record) => ({ ...record, statements: [...record.statements] })),
    ],
    approvedPendingMigrations: [] as ApprovedPendingMigration[],
  };
}

function expectIssue(input: unknown, code: string) {
  const result = compareStagingMigrationBaseline(input);
  expect(result.ok).toBe(false);
  expect(result.issues).toContainEqual(expect.objectContaining({ code }));
  expect(result.pendingVersions).toEqual([]);
  expect(result.historicallySatisfiedVersions).toEqual([]);
}

function launchBody(source: string) {
  const match = source.match(
    /create(?: or replace)? function public\.launch_tournament_division_without_matchup_activation\([\s\S]*?\bas\s+(\$[a-z_]*\$)([\s\S]*?)\1;/i
  );
  if (!match) throw new Error("Missing explicit canonical launch definition");
  return match[2].replace(/\r\n/g, "\n").trim();
}

describe("Staging historical migration archives", () => {
  it("preserves both exact single-statement ledger payloads outside executable migrations", () => {
    for (const [index, pin] of HISTORICAL_RECORDS.entries()) {
      const archive = archives[index];
      expect(Object.keys(archive).sort()).toEqual(["name", "statements", "version"]);
      expect(archive.version).toBe(pin.version);
      expect(archive.name).toBe(pin.name);
      expect(archive.statements).toHaveLength(1);
      expect(digest(archive.statements[0])).toBe(pin.statementsSha256);
      expect(localMigrations.some((record) => record.version === pin.version)).toBe(false);
    }
    expect(archiveDirectory.startsWith("docs/")).toBe(true);
    expect(readdirSync(resolve(root, archiveDirectory)).filter((file) => file.endsWith(".sql")))
      .toEqual([]);
  });

  it("preserves the original defect as evidence and the parity definition as the canonical correction", () => {
    const canonical = localMigrations.find((record) =>
      record.version === CANONICAL_MIGRATION.version
    )!;
    const originalBody = launchBody(archives[0].statements[0]);
    const parityBody = launchBody(archives[1].statements[0]);
    const canonicalBody = launchBody(canonical.sql);
    const brokenPredicate = /from public\.tournament_matches as match\s+where match\.player_one_slot is not null\s+and match\.player_two_registration_id is not null/;
    expect(originalBody).toMatch(brokenPredicate);
    expect(parityBody).not.toMatch(brokenPredicate);
    expect(parityBody).toBe(canonicalBody);
    expect(canonicalBody).toMatch(
      /select match\.player_two_registration_id\s+from public\.tournament_matches as match\s+where match\.generated_bracket_id = v_generated_bracket_id\s+and match\.player_two_slot is not null\s+and match\.player_two_registration_id is not null/
    );
    expect(migrationSourceSha256(canonical.sql)).toBe(CANONICAL_MIGRATION.sha256);
    expect(migrationSourceSha256(localMigrations.find((record) =>
      record.version === MEMBER_RPC_MIGRATION.version
    )!.sql)).toBe(MEMBER_RPC_MIGRATION.sha256);
  });

  it("keeps the documentation manifest aligned with the fixed exception and shared applied migration", () => {
    const manifest = JSON.parse(read(archiveDirectory + "/baseline.json"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.project).toEqual({ name: "ironclad-staging", ref: STAGING_PROJECT_REF });
    expect(manifest.source.baseCommit).toBe("631e5ad225fdd8e702e99a3e80e57e2f62368051");
    expect(manifest.source.canonicalMigration).toMatchObject(CANONICAL_MIGRATION);
    expect(manifest.source.restoredSharedChange.migration).toMatchObject({
      ...MEMBER_RPC_MIGRATION,
      classification: "shared-applied",
    });
    expect(manifest.archives).toHaveLength(2);
    for (const [index, pin] of HISTORICAL_RECORDS.entries()) {
      expect(manifest.archives[index]).toMatchObject({
        ...pin,
        path: archiveDirectory + "/" + pin.version + ".json",
        statementCount: 1,
      });
    }
    expect(manifest.reconciliations).toHaveLength(1);
    expect(manifest.reconciliations[0]).toMatchObject({
      repositoryVersion: CANONICAL_MIGRATION.version,
      classification: "historically-satisfied",
      requiredLedgerVersions: HISTORICAL_RECORDS.map((record) => record.version),
    });
    expect(manifest.approvedPendingMigrations).toEqual([]);
    expect(manifest.unknownDifferencePolicy).toBe("fail-closed");
    expect(manifest.applicationAuthorization).toBe(false);
  });
});

describe("offline Staging migration baseline comparison", () => {
  it("accepts only the complete known exception with member RPC already shared", () => {
    expect(compareStagingMigrationBaseline(snapshot())).toEqual({
      ok: true,
      issues: [],
      pendingVersions: [],
      historicallySatisfiedVersions: [CANONICAL_MIGRATION.version],
    });
    const withoutOptionalApprovals = snapshot();
    const { approvedPendingMigrations: omitted, ...input } = withoutOptionalApprovals;
    expect(omitted).toEqual([]);
    expect(compareStagingMigrationBaseline(input).ok).toBe(true);
  });

  it.each(["nsyjtqpvyxlzyujlbzos", "another-staging", "", undefined])(
    "rejects another or missing project ref: %s",
    (projectRef) => expectIssue({ ...snapshot(), projectRef }, "wrong-project")
  );

  it.each([null, [], {}, { ...snapshot(), extraIgnore: ["unknown"] }])(
    "rejects malformed top-level payloads",
    (input) => expectIssue(input, "invalid-input")
  );

  it.each(["localMigrations", "remoteMigrations", "approvedPendingMigrations"])(
    "rejects invalid collection payloads: %s",
    (field) => expectIssue({ ...snapshot(), [field]: null }, "invalid-input")
  );

  it.each(HISTORICAL_RECORDS)("requires historical record $version", (pin) => {
    const input = snapshot();
    input.remoteMigrations = input.remoteMigrations.filter((record) => record.version !== pin.version);
    expectIssue(input, "historical-record-missing");
  });

  it.each(HISTORICAL_RECORDS)("rejects changed names and exact SQL bytes for $version", (pin) => {
    const input = snapshot();
    const record = input.remoteMigrations.find((item) => item.version === pin.version)!;
    record.name += "_changed";
    expectIssue(input, "historical-name-mismatch");
    record.name = pin.name;
    record.statements[0] += "\n";
    expectIssue(input, "historical-sql-mismatch");
    record.statements = [...archives.find((item) => item.version === pin.version)!.statements, "select 1;"];
    expectIssue(input, "historical-sql-mismatch");
  });

  it("rejects duplicate local and remote versions", () => {
    const input = snapshot();
    input.localMigrations.push({ ...input.localMigrations[0] });
    expectIssue(input, "duplicate-local-version");
    input.localMigrations.pop();
    input.remoteMigrations.push({ ...input.remoteMigrations[0] });
    expectIssue(input, "duplicate-remote-version");
  });

  it("rejects invalid records without returning SQL or supplied values as diagnostics", () => {
    const input = snapshot();
    const result = compareStagingMigrationBaseline({
      ...input,
      remoteMigrations: [...input.remoteMigrations, { version: "private-invalid", name: "x", statements: [12] }],
      localMigrations: [...input.localMigrations, { version: "20260910000000", name: "x", sql: "" }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: "invalid-remote-record" });
    expect(result.issues).toContainEqual({ code: "invalid-local-record" });
    expect(JSON.stringify(result)).not.toContain("private-invalid");
  });

  it("rejects unknown remote versions and absent ordinary local sources", () => {
    const input = snapshot();
    input.remoteMigrations.push({ version: "20990101000000", name: "unknown", statements: ["select 1;"] });
    expectIssue(input, "unknown-remote-version");
    input.remoteMigrations.pop();
    input.localMigrations.shift();
    expectIssue(input, "unknown-remote-version");
  });

  it("rejects shared-name drift, changed source pins, and missing applied member RPC", () => {
    const input = snapshot();
    const member = input.remoteMigrations.find((record) => record.version === MEMBER_RPC_MIGRATION.version)!;
    member.name += "_changed";
    expectIssue(input, "shared-name-mismatch");
    member.name = MEMBER_RPC_MIGRATION.name;
    input.remoteMigrations = input.remoteMigrations.filter((record) => record !== member);
    expectIssue(input, "required-shared-migration-missing");
    for (const pin of [CANONICAL_MIGRATION, MEMBER_RPC_MIGRATION]) {
      const changed = snapshot();
      changed.localMigrations.find((record) => record.version === pin.version)!.sql += "-- changed";
      expectIssue(changed, "required-local-migration-changed");
      changed.localMigrations = changed.localMigrations.filter((record) => record.version !== pin.version);
      expectIssue(changed, "required-local-migration-missing");
    }
  });

  it("rejects repaired canonical history and executable copies of the historical archives", () => {
    const input = snapshot();
    const canonical = input.localMigrations.find((record) => record.version === CANONICAL_MIGRATION.version)!;
    input.remoteMigrations.push({ version: canonical.version, name: canonical.name, statements: [canonical.sql] });
    expectIssue(input, "unexpected-canonical-ledger-entry");
    input.remoteMigrations.pop();
    input.localMigrations.push({
      version: archives[0].version, name: archives[0].name, sql: archives[0].statements[0],
    });
    expectIssue(input, "historical-archive-in-migration-inventory");
  });

  it("permits future pending source only with an explicit exact version, name and LF source digest", () => {
    const input = snapshot();
    const future = { version: "20260910000000", name: "reviewed_future_change", sql: "begin;\nselect 1;\nrollback;\n" };
    input.localMigrations.push(future);
    expectIssue(input, "unapproved-local-only-version");
    input.approvedPendingMigrations.push({
      version: future.version, name: future.name, sha256: migrationSourceSha256(future.sql),
    });
    expect(compareStagingMigrationBaseline(input)).toMatchObject({ ok: true, pendingVersions: [future.version] });
    future.sql = future.sql.replace(/\n/g, "\r\n");
    expect(compareStagingMigrationBaseline(input).ok).toBe(true);
    future.sql += "-- changed";
    expectIssue(input, "pending-source-mismatch");
    future.sql = "begin;\nselect 1;\nrollback;\n";
    input.approvedPendingMigrations[0].name += "_changed";
    expectIssue(input, "pending-source-mismatch");
  });

  it("rejects stale, duplicate, missing-source and malformed pending approvals", () => {
    const input = snapshot();
    const approval = { version: "20260910000000", name: "future", sha256: digest("select 1;") };
    input.approvedPendingMigrations = [approval];
    expectIssue(input, "pending-approval-missing-local");
    input.localMigrations.push({ version: approval.version, name: approval.name, sql: "select 1;" });
    input.approvedPendingMigrations.push({ ...approval });
    expectIssue(input, "duplicate-pending-approval");
    input.approvedPendingMigrations.pop();
    input.remoteMigrations.push({ version: approval.version, name: approval.name, statements: ["select 1;"] });
    expectIssue(input, "pending-approval-not-pending");
    expectIssue({ ...input, approvedPendingMigrations: [{ ...approval, sha256: "*" }] }, "invalid-pending-approval");
  });

  it.each([CANONICAL_MIGRATION, MEMBER_RPC_MIGRATION, ...HISTORICAL_RECORDS])(
    "cannot turn historical prerequisite $version into an approved pending migration",
    (pin) => {
      const input = snapshot();
      input.approvedPendingMigrations.push({ version: pin.version, name: pin.name, sha256: "a".repeat(64) });
      expectIssue(input, "historical-pending-approval-forbidden");
    }
  );


  it("accepts metadata-only ordinary records but requires historical SQL evidence", () => {
    const input = snapshot();
    const historicalVersions = new Set<string>(HISTORICAL_RECORDS.map((record) => record.version));
    const remoteMigrations = input.remoteMigrations.map((record) =>
      historicalVersions.has(record.version) ? record : { version: record.version, name: record.name }
    );
    expect(compareStagingMigrationBaseline({ ...input, remoteMigrations }).ok).toBe(true);
    expectIssue({
      ...input,
      remoteMigrations: remoteMigrations.map((record) => ({
        version: record.version, name: record.name,
      })),
    }, "historical-sql-mismatch");
  });

  it("does not mutate supplied snapshots", () => {
    const input = snapshot();
    const before = JSON.stringify(input);
    compareStagingMigrationBaseline(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
