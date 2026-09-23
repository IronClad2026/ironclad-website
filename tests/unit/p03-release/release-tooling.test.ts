import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// Native operational scripts intentionally have no application dependency graph.
import { assessQuietWindow, canonical, compare, connection, digest, matchRoomIsOff, PRODUCTION_REF, run } from "../../../scripts/p03-release/core.mjs";
import { FACTS, competitionSql, validateTournamentIds } from "../../../scripts/p03-release/facts.mjs";
import { canonicalCheck, normalizeSchema, validateExtensionRuntime } from "../../../scripts/p03-release/backup.mjs";
import { BROWSER_CASES, gate, validateBrowserReport } from "../../../scripts/p03-release/gate.mjs";

const id = "d23a0000-0000-4000-8000-000000000001";
const localEnv = { P03_DATABASE_URL: "postgresql://postgres:private-secret@127.0.0.1:56623/p03_rehearsal" };
type FactRow = Record<string, string | number | null>;
const snapshot = () => ({ tournamentIds: [id], competitionSha256: "test", state: { serverNow: "2026-09-23T04:00:00Z" }, tables: Object.fromEntries(Object.keys(FACTS).map((name) => [name, { rows: [] as FactRow[], count: 0 }])) });

describe("P03 operational read-only boundary", () => {
  it("requires an explicit connection and rejects arbitrary remote hosts", () => {
    expect(() => connection({})).toThrow("required");
    expect(() => connection({ P03_DATABASE_URL: "postgresql://postgres@example.com/postgres" })).toThrow("not approved");
  });
  it("keeps credentials out of argument identity and forces read-only sessions", () => {
    const db = connection({ ...localEnv, PGHOST: "production", PGOPTIONS: "unsafe", PGSERVICE: "production", P03_RESTORE_DATABASE_URL: "private" });
    expect(db.projectRef).toBe("local");
    expect(db.env.PGHOST).toBe("127.0.0.1");
    expect(db.env.PGPASSWORD).toBe("private-secret");
    expect(db.env.PGOPTIONS).toContain("default_transaction_read_only=on");
    expect(db.env.PGSERVICE).toBeUndefined();
    expect(db.env.P03_DATABASE_URL).toBeUndefined();
    expect(db.env.P03_RESTORE_DATABASE_URL).toBeUndefined();
  });
  it("verifies Supabase identity and TLS, rejects transaction poolers", () => {
    const db = connection({ P03_DATABASE_URL: `postgresql://postgres@db.${PRODUCTION_REF}.supabase.co/postgres` });
    expect(db.projectRef).toBe(PRODUCTION_REF);
    expect(db.env.PGSSLMODE).toBe("verify-full");
    expect(() => connection({ P03_DATABASE_URL: `postgresql://postgres.${PRODUCTION_REF}@aws-0-au.pooler.supabase.com:6543/postgres` })).toThrow("5432");
    expect(() => connection({ P03_DATABASE_URL: `${localEnv.P03_DATABASE_URL}?host=production` })).toThrow("overrides");
  });
  it("cannot restore remotely or into an ordinary local database", () => {
    expect(() => connection({ P03_RESTORE_DATABASE_URL: `postgresql://postgres@db.${PRODUCTION_REF}.supabase.co/p03_restore_test` }, "P03_RESTORE_DATABASE_URL", { localOnly: true })).toThrow("loopback");
    expect(() => connection({ P03_RESTORE_DATABASE_URL: localEnv.P03_DATABASE_URL }, "P03_RESTORE_DATABASE_URL", { localOnly: true })).toThrow("p03_restore_");
    expect(connection({ P03_RESTORE_DATABASE_URL: "postgresql://postgres@127.0.0.1:56623/p03_restore_test" }, "P03_RESTORE_DATABASE_URL", { localOnly: true }).local).toBe(true);
  });
  it("does not expose subprocess stderr", () => {
    expect(() => run(process.execPath, ["-e", "process.stderr.write('private-secret');process.exit(7)"])).toThrow("exit 7");
    try { run(process.execPath, ["-e", "process.stderr.write('private-secret');process.exit(7)"]); } catch (error) { expect(String(error)).not.toContain("private-secret"); }
  });
  it("absent setting is OFF only before any P03 capability exists", () => {
    expect(matchRoomIsOff({ matchRoomSetting: null, matchRoomCapabilities: 0, matchRoomTables: 0 })).toBe(true);
    expect(matchRoomIsOff({ matchRoomSetting: null, matchRoomCapabilities: 1, matchRoomTables: 0 })).toBe(false);
    expect(matchRoomIsOff({ matchRoomSetting: null, matchRoomCapabilities: 0, matchRoomTables: 1 })).toBe(false);
    expect(matchRoomIsOff({ matchRoomSetting: { enabled: false } })).toBe(true);
    expect(matchRoomIsOff({ matchRoomSetting: { enabled: "false" } })).toBe(false);
  });
});

describe("P03 competition evidence", () => {
  it("rejects unbounded scopes and injection", () => {
    expect(() => validateTournamentIds([])).toThrow();
    expect(() => validateTournamentIds([id, id])).toThrow();
    expect(() => competitionSql(["');delete from tournaments;--"])).toThrow();
    expect(() => competitionSql([id], 20001)).toThrow();
  });
  it("uses actual required column references so missing score/deadline columns fail SQL compilation", () => {
    const sql = competitionSql([id]);
    expect(sql).toContain("to_jsonb(t.player_one_score)");
    expect(sql).toContain("to_jsonb(t.player_one_slot)");
    expect(sql).toContain("to_jsonb(t.deadline_at)");
    expect(sql).not.toContain("to_jsonb(t)->");
    expect(sql).toContain("limit 10001");
  });
  it("hashes private evidence before it leaves PostgreSQL and omits message/profile fields", () => {
    const sql = competitionSql([id]);
    expect(sql).toContain("sha256(convert_to(to_jsonb(t.replay_storage_path)::text");
    expect(sql).not.toContain("clerk_user_id");
    expect(sql).not.toContain("public.players");
    expect(sql).not.toContain("match_messages");
    expect(sql).not.toContain("notes");
  });
  it("reports exact changed competition facts without their values", () => {
    const before = snapshot(); const after = snapshot();
    before.tables.tournament_matches.rows = [{ id, player_one_score: 2, winner_registration_id: "old-private" }];
    after.tables.tournament_matches.rows = [{ id, player_one_score: 3, winner_registration_id: "new-private" }];
    const result = compare(before, after);
    expect(result.pass).toBe(false);
    expect(result.differences).toEqual([`tournament_matches/${id}/player_one_score: changed`, `tournament_matches/${id}/winner_registration_id: changed`]);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("detects added, removed, and missing tables", () => {
    const before = snapshot(); const after = snapshot();
    after.tables.registrations.rows.push({ id });
    delete after.tables.tournament_standings;
    expect(compare(before, after).differences).toEqual(expect.arrayContaining([`registrations/${id}: added`, "tournament_standings: missing table evidence"]));
  });
  it("canonicalizes object order without erasing array ordering", () => {
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });
  it("stops for competition cron due within the approval horizon", () => {
    const facts = snapshot();
    facts.tables.registrations.rows.push({ id, waitlist_offer_status: "offered", waitlist_offer_expires_at: "2026-09-23T04:08:00Z" });
    facts.tables.match_result_report_groups.rows.push({ id, status: "pending_confirmation", confirmation_deadline_at: "2026-09-23T04:05:00Z" });
    facts.tables.tournament_matches.rows.push({ id, status: "in_progress", deadline_at: "2026-09-23T04:01:00Z" });
    expect(assessQuietWindow(facts).reasons).toHaveLength(3);
    facts.tables.tournament_matches.rows[0].hold_started_at = "2026-09-23T03:50:00Z";
    expect(assessQuietWindow(facts).reasons).toHaveLength(2);
  });
});

describe("restore schema verification", () => {
  it("refuses a runtime missing hosted extensions or their required version", () => {
    expect(() => validateExtensionRuntime([{ name: "pg_net", version: "0.19.5" }], [{ name: "pgcrypto", default_version: "1.3" }])).toThrow("pg_net@0.19.5");
    expect(() => validateExtensionRuntime([{ name: "pgcrypto", version: "1.3" }], [{ name: "pgcrypto", default_version: "1.2" }])).toThrow("matching");
    expect(() => validateExtensionRuntime([{ name: "pgcrypto", version: "1.3" }], [{ name: "pgcrypto", default_version: "1.3" }])).not.toThrow();
  });
  it("accepts PostgreSQL associative CHECK flattening only", () => {
    expect(canonicalCheck("(((a >= 1) AND (a <= 5)) AND (a <= b))")).toBe(canonicalCheck("((a >= 1) AND (a <= 5) AND (a <= b))"));
    expect(canonicalCheck("(a AND (b OR c))")).not.toBe(canonicalCheck("((a AND b) OR c)"));
    expect(canonicalCheck("(a = 'private AND (text)')")).not.toBe(canonicalCheck("(a = 'other AND (text)')"));
  });
  it("ignores only nonsemantic dump markers and preserves actual SQL", () => {
    expect(normalizeSchema("\\restrict abc\n-- Dumped by pg_dump version 17.11\nCREATE TABLE a (id uuid);\n\\unrestrict abc\n")).toBe("CREATE TABLE a (id uuid);");
    expect(normalizeSchema("CREATE TABLE a (id uuid);")).not.toBe(normalizeSchema("CREATE TABLE a (id text);"));
  });
});

describe("Preview evidence", () => {
  const config = { candidateSha: "a".repeat(40), previewUrl: "https://candidate.vercel.app" };
  const report = () => ({ metadata: { ...config, supabaseProjectRef: "zzbnneprhjicmajpjkdg" }, stats: { unexpected: 0, skipped: 0, flaky: 0, expected: 14 }, errors: [], suites: [{ specs: BROWSER_CASES.map((name: string) => ({ title: `[p03:${name}]`, ok: true, tests: [{ status: "expected", results: [{ status: "passed" }] }] })) }] });
  it("requires real successful results for every named browser scenario", () => { expect(() => validateBrowserReport(report(), config)).not.toThrow(); });
  it("rejects mismatched commits, missing scenarios, skipped or failed results", () => {
    const wrong = report(); wrong.metadata.candidateSha = "b".repeat(40);
    expect(() => validateBrowserReport(wrong, config)).toThrow("binding");
    const missing = report(); missing.suites[0].specs.pop();
    expect(() => validateBrowserReport(missing, config)).toThrow("scenario");
    const failed = report(); failed.suites[0].specs[0].tests[0].results[0].status = "failed";
    expect(() => validateBrowserReport(failed, config)).toThrow("scenario");
    const skipped = report(); skipped.stats.skipped = 1;
    expect(() => validateBrowserReport(skipped, config)).toThrow("skipped");
  });
});

it("writes one STOP receipt without reaching remote work when its seal is incomplete", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "p03-release-stop-test-"));
  const sealFile = path.join(directory, "seal.json");
  const output = path.join(directory, "gate.json");
  writeFileSync(sealFile, JSON.stringify({ schemaVersion: 1 }));
  const result = await gate({ repository: process.cwd(), sealFile, backupDirectory: directory, output, env: { NODE_ENV: "test" } });
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toHaveLength(1);
  expect(result.reasons[0]).toContain("seal");
  expect(result.evidence).toEqual({});
  expect(JSON.parse(readFileSync(output, "utf8")).verdict).toBe("STOP");
});
