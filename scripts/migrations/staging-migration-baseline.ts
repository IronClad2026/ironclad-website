import { createHash } from "node:crypto";

export const STAGING_PROJECT_REF = "zzbnneprhjicmajpjkdg";

export const CANONICAL_MIGRATION = Object.freeze({
  version: "20260904120000",
  name: "canonical_division_launch_ordering",
  sha256: "5b72390cbfdcc88278b4bf9b697c5581b093fa3d5984885f9aca39746dc5497b",
});

export const MEMBER_RPC_MIGRATION = Object.freeze({
  version: "20260908052210",
  name: "member_rpc_current_account_acceptance",
  sha256: "aaaa8061da7860cc213f0b8f307282b17d1bb3ad86f5c493293951930872fd72",
});

export const HISTORICAL_RECORDS = Object.freeze([
  Object.freeze({
    version: "20260905013141",
    name: "20260904120000_canonical_division_launch_ordering",
    statementsSha256: "cd66dfc4b1295934e54de187d3d6ea38c278938bc533fbf4e238ca6842106958",
  }),
  Object.freeze({
    version: "20260908104335",
    name: "staging_only_canonical_launch_parity",
    statementsSha256: "8362739c1c095c21baa68be4cb5f481502fa7baa5e5d2e462549669840fcf40c",
  }),
]);

export type LocalMigration = {
  version: string;
  name: string;
  sql: string;
};

export type RemoteMigration = {
  version: string;
  name: string;
  statements?: string[];
};

export type ApprovedPendingMigration = {
  version: string;
  name: string;
  sha256: string;
};

export type BaselineIssue = {
  code: string;
  version?: string;
};

export type BaselineComparison = {
  ok: boolean;
  issues: BaselineIssue[];
  pendingVersions: string[];
  historicallySatisfiedVersions: string[];
};

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function migrationIdentity(value: Record<string, unknown>): boolean {
  return typeof value.version === "string"
    && /^\d{14}$/.test(value.version)
    && typeof value.name === "string"
    && /^[a-z0-9_]+$/.test(value.name);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Source pins use Git-style LF; archived ledger statements always use exact UTF8. */
export function migrationSourceSha256(sql: string): string {
  return sha256(sql.replace(/\r\n/g, "\n"));
}

/**
 * Pure offline comparison of supplied snapshots, not live verification.
 * No SQL is executed and success grants no migration or deployment permission.
 * Both immutable historical records jointly satisfy the absent canonical version.
 */
export function compareStagingMigrationBaseline(input: unknown): BaselineComparison {
  const issues: BaselineIssue[] = [];
  const pendingVersions: string[] = [];
  const historicallySatisfiedVersions: string[] = [];
  const result = (): BaselineComparison => ({
    ok: issues.length === 0,
    issues,
    pendingVersions: issues.length === 0 ? pendingVersions.sort() : [],
    historicallySatisfiedVersions: issues.length === 0 ? historicallySatisfiedVersions : [],
  });
  const fail = (code: string, version?: string) => {
    issues.push(version === undefined ? { code } : { code, version });
  };

  if (!exactKeys(input, ["projectRef", "localMigrations", "remoteMigrations"])
    && !exactKeys(input, [
      "projectRef", "localMigrations", "remoteMigrations", "approvedPendingMigrations",
    ])) {
    fail("invalid-input");
    return result();
  }
  if (input.projectRef !== STAGING_PROJECT_REF) {
    fail("wrong-project");
    return result();
  }
  const approvedInput = Object.hasOwn(input, "approvedPendingMigrations")
    ? input.approvedPendingMigrations
    : [];
  if (!Array.isArray(input.localMigrations)
    || !Array.isArray(input.remoteMigrations)
    || !Array.isArray(approvedInput)) {
    fail("invalid-input");
    return result();
  }

  const local = new Map<string, LocalMigration>();
  const remote = new Map<string, RemoteMigration>();
  const approved = new Map<string, ApprovedPendingMigration>();
  for (const item of input.localMigrations) {
    if (!exactKeys(item, ["version", "name", "sql"])
      || !migrationIdentity(item)
      || typeof item.sql !== "string"
      || item.sql.trim() === "") {
      fail("invalid-local-record");
      continue;
    }
    const record = item as LocalMigration;
    if (local.has(record.version)) {
      fail("duplicate-local-version", record.version);
    } else {
      local.set(record.version, record);
    }
  }
  for (const item of input.remoteMigrations) {
    if ((!exactKeys(item, ["version", "name"])
      && !exactKeys(item, ["version", "name", "statements"]))
      || !migrationIdentity(item)
      || (Object.hasOwn(item, "statements") && (
        !Array.isArray(item.statements)
        || item.statements.length === 0
        || !Array.from(item.statements).every((statement) => typeof statement === "string" && statement.trim() !== "")
      ))) {
      fail("invalid-remote-record");
      continue;
    }
    const record = item as RemoteMigration;
    if (remote.has(record.version)) {
      fail("duplicate-remote-version", record.version);
    } else {
      remote.set(record.version, record);
    }
  }
  for (const item of approvedInput) {
    if (!exactKeys(item, ["version", "name", "sha256"])
      || !migrationIdentity(item)
      || typeof item.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      fail("invalid-pending-approval");
      continue;
    }
    const record = item as ApprovedPendingMigration;
    if (record.version <= HISTORICAL_RECORDS[1].version) {
      fail("historical-pending-approval-forbidden", record.version);
    } else if (approved.has(record.version)) {
      fail("duplicate-pending-approval", record.version);
    } else {
      approved.set(record.version, record);
    }
  }

  for (const pin of [CANONICAL_MIGRATION, MEMBER_RPC_MIGRATION]) {
    const record = local.get(pin.version);
    if (!record) {
      fail("required-local-migration-missing", pin.version);
    } else if (record.name !== pin.name || migrationSourceSha256(record.sql) !== pin.sha256) {
      fail("required-local-migration-changed", pin.version);
    }
  }
  if (!remote.has(MEMBER_RPC_MIGRATION.version)) {
    fail("required-shared-migration-missing", MEMBER_RPC_MIGRATION.version);
  }
  if (remote.has(CANONICAL_MIGRATION.version)) {
    fail("unexpected-canonical-ledger-entry", CANONICAL_MIGRATION.version);
  }

  let historicalPairMatches = true;
  for (const pin of HISTORICAL_RECORDS) {
    const record = remote.get(pin.version);
    if (!record) {
      fail("historical-record-missing", pin.version);
      historicalPairMatches = false;
    } else if (record.name !== pin.name) {
      fail("historical-name-mismatch", pin.version);
      historicalPairMatches = false;
    } else if (record.statements?.length !== 1 || sha256(record.statements[0]) !== pin.statementsSha256) {
      fail("historical-sql-mismatch", pin.version);
      historicalPairMatches = false;
    }
    if (local.has(pin.version)) {
      fail("historical-archive-in-migration-inventory", pin.version);
    }
  }
  if (historicalPairMatches && !remote.has(CANONICAL_MIGRATION.version)) {
    historicallySatisfiedVersions.push(CANONICAL_MIGRATION.version);
  }

  const historicalVersions = new Set<string>(HISTORICAL_RECORDS.map((record) => record.version));
  for (const record of remote.values()) {
    if (historicalVersions.has(record.version)
      || record.version === CANONICAL_MIGRATION.version) continue;
    const source = local.get(record.version);
    if (!source) {
      fail("unknown-remote-version", record.version);
    } else if (record.name !== source.name) {
      fail("shared-name-mismatch", record.version);
    }
  }
  for (const record of local.values()) {
    if (record.version === CANONICAL_MIGRATION.version || remote.has(record.version)) continue;
    const approval = approved.get(record.version);
    if (!approval) {
      fail("unapproved-local-only-version", record.version);
    } else if (approval.name !== record.name || approval.sha256 !== migrationSourceSha256(record.sql)) {
      fail("pending-source-mismatch", record.version);
    } else {
      pendingVersions.push(record.version);
    }
  }
  for (const record of approved.values()) {
    if (!local.has(record.version)) {
      fail("pending-approval-missing-local", record.version);
    } else if (remote.has(record.version)) {
      fail("pending-approval-not-pending", record.version);
    }
  }

  return result();
}
