import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_MIGRATION, HISTORICAL_RECORDS, MEMBER_RPC_MIGRATION, STAGING_PROJECT_REF,
  compareStagingMigrationBaseline, type ApprovedPendingMigration, type RemoteMigration,
} from "@/scripts/migrations/staging-migration-baseline";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const originalRecord = JSON.parse(read("docs/player-showcase-phase-a-migration-approval.json"));
const correctionRecord = JSON.parse(read("docs/player-showcase-phase-a-owner-rls-approval.json"));
const approvalFrom = (record: ApprovedPendingMigration): ApprovedPendingMigration => ({
  version: record.version, name: record.name, sha256: record.sha256,
});
const original = approvalFrom(originalRecord);
const correction = approvalFrom(correctionRecord);
const digest = (sql: string) => createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
const localMigrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file)).sort()
  .map((file) => ({ version: file.slice(0, 14), name: file.slice(15, -4), sql: read(`supabase/migrations/${file}`) }));

// Synthetic ordinary ledger rows test offline classification, not live database health.
// The original snapshot predates the correction and excludes it from both inventories.
function snapshot(phase: "original" | "correction" = "correction") {
  const approval = phase === "original" ? original : correction;
  const source = localMigrations.filter(({ version }) => phase !== "original" || version !== correction.version);
  return {
    projectRef: STAGING_PROJECT_REF, localMigrations: [...source],
    remoteMigrations: [
      ...source.filter(({ version }) => ![CANONICAL_MIGRATION.version, approval.version].includes(version))
        .map(({ version, name }) => ({ version, name })),
      ...HISTORICAL_RECORDS.map(({ version }) =>
        JSON.parse(read(`docs/staging-migration-history/${version}.json`)) as RemoteMigration),
    ],
    approvedPendingMigrations: [{ ...approval }],
  };
}

const accepted = (pendingVersions: string[]) => ({ ok: true, issues: [], pendingVersions,
  historicallySatisfiedVersions: [CANONICAL_MIGRATION.version] });

describe("exact Player Showcase Staging migration approvals", () => {
  it("pins both exact sources and keeps approval separate from the historical baseline", () => {
    expect(original).toEqual({ version: "20260909234122", name: "player_showcase_phase_a",
      sha256: "1475d6bb94a7dee20e17d7c0cb4cc5f2b80b1163fe3f9e1520cd2b1e71885b6e" });
    expect(correction).toEqual({ version: "20260910020800", name: "player_showcase_owner_read_rls",
      sha256: "78387a72713365898ce977159d2a0574bdfb68fe06bcea0e81fc9f814ff64319" });
    for (const record of [originalRecord, correctionRecord]) {
      expect(record.metadata.project.ref).toBe(STAGING_PROJECT_REF);
      expect(digest(read(record.metadata.sourcePath))).toBe(record.sha256);
    }
    expect(originalRecord.metadata.initialReviewedSourceCommit).toBe("48872763cd79a89d681fa665e8ef72fc47458643");
    expect(correctionRecord.metadata.requiresAppliedMigration).toBe(original.version);
    expect(JSON.parse(read("docs/staging-migration-history/baseline.json")).approvedPendingMigrations).toEqual([]);
  });

  it.each(["original", "correction"] as const)("allows the sole exact approval in the %s snapshot", (phase) => {
    const input = snapshot(phase);
    const approval = phase === "original" ? original : correction;
    expect(input.remoteMigrations).toContainEqual({ version: MEMBER_RPC_MIGRATION.version, name: MEMBER_RPC_MIGRATION.name });
    if (phase === "correction") {
      expect(input.remoteMigrations).toContainEqual({ version: original.version, name: original.name });
    }
    expect(compareStagingMigrationBaseline(input)).toEqual(accepted([approval.version]));
  });

  it.each(["original", "correction"] as const)("rejects modified exact approvals in the %s snapshot", (phase) => {
    const approval = phase === "original" ? original : correction;
    for (const change of [{ sha256: "0".repeat(64) }, { name: "unexpected_showcase" }, { version: "20260910020801" }]) {
      const input = snapshot(phase);
      input.approvedPendingMigrations = [{ ...approval, ...change }];
      expect(compareStagingMigrationBaseline(input)).toMatchObject({ ok: false, pendingVersions: [] });
    }
  });

  it("rejects missing original application and unrelated pending work", () => {
    const missingOriginal = snapshot();
    missingOriginal.remoteMigrations = missingOriginal.remoteMigrations.filter(({ version }) => version !== original.version);
    expect(compareStagingMigrationBaseline(missingOriginal)).toMatchObject({ ok: false, pendingVersions: [],
      issues: expect.arrayContaining([{ code: "unapproved-local-only-version", version: original.version }]) });
    const unknown = snapshot();
    unknown.localMigrations.push({ version: "20260910030000", name: "unreviewed_change", sql: "select 1;\n" });
    expect(compareStagingMigrationBaseline(unknown)).toMatchObject({ ok: false, pendingVersions: [],
      issues: expect.arrayContaining([{ code: "unapproved-local-only-version", version: "20260910030000" }]) });
  });

  it.each(["original", "correction"] as const)("rejects a stale %s approval after application", (phase) => {
    const input = snapshot(phase);
    const approval = phase === "original" ? original : correction;
    input.remoteMigrations.push({ version: approval.version, name: approval.name });
    expect(compareStagingMigrationBaseline(input)).toMatchObject({ ok: false, pendingVersions: [],
      issues: expect.arrayContaining([{ code: "pending-approval-not-pending", version: approval.version }]) });
    input.approvedPendingMigrations = [];
    expect(compareStagingMigrationBaseline(input)).toEqual(accepted([]));
  });

  it("changes only the SELECT policy and pins the unchanged privileged function prerequisites", () => {
    const sql = read(correctionRecord.metadata.sourcePath).replace(/--[^\n]*/g, "");
    expect(sql).toMatch(/alter policy "Players can read their own Showcase"\s+on public\.player_showcases\s+to authenticated\s+using\s*\(\s*player_id = \(select \(public\.get_my_player_showcase\(\) ->> 'player_id'\)::uuid\)\s*\);/i);
    expect(sql.match(/\balter policy\b/gi)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(?:grant|revoke|create|drop|insert|update|delete|truncate)\b/i);
    expect(sql).not.toMatch(/\balter\s+(?:table|function|role|view)\b/i);
    expect(sql).not.toContain(STAGING_PROJECT_REF);
    expect(sql).toContain("'9f44de7895c1e80f7464a0bd1f709e10c03750805018c9cfc975f792cea6932a'");
    expect(sql).toContain("'c7f99cd94e6168379aee7f797fe9ced2f52f952369d5da12dfc5a7d2dce3381a'");
    expect(sql).toContain("rolname = 'postgres' and rolbypassrls");
    expect(sql).toContain("has_column_privilege('authenticated', 'public.players', 'account_closed_at', 'SELECT')");
    expect(sql).toContain("has_function_privilege('anon', 'public.get_my_player_showcase()', 'EXECUTE')");
    expect(sql).toContain("relrowsecurity and relforcerowsecurity");
  });

  it("retains the strict rollback-only runtime suite behind exact two-migration history guards", () => {
    const sql = read("tests/database/player-showcase-staging-contract.sql");
    expect(sql).toContain("where m.version not in ('20260909234122', '20260910020800')");
    expect(sql).toContain("schema_migrations) <> 150");
    expect(sql).toContain("86d032ff2d6bb18210713ef8d35304f52d4464d4fbbc471fa4a87146bf961891");
    expect(sql).toContain(original.sha256);
    expect(sql).toContain(correction.sha256);
    expect(sql).toContain("where version = '20260910020800' and name = 'player_showcase_owner_read_rls'");
    expect(sql).toContain("(select count(*) from pg_temp.showcase_contract_checks) <> 50");
    expect(sql).toContain("'owner-rls-read-own-row'");
    expect(sql.match(/^rollback;$/gim)).toHaveLength(1);
    expect(sql).not.toMatch(/^commit;/im);
  });
});
