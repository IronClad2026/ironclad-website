import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { FACTS, competitionSql, validateTournamentIds } from "./facts.mjs";

export const PRODUCTION_REF = "nsyjtqpvyxlzyujlbzos";
export const STAGING_REF = "zzbnneprhjicmajpjkdg";
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value) => sha256(canonical(value));
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
export const fileHash = (file) => sha256(readFileSync(file));
export function saveJson(file, value) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}
export function invariant(condition, reason) { if (!condition) throw new Error(reason); }
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, ...options });
  // Never echo stderr: libpq/tool failures may contain secrets or private data.
  invariant(!result.error && result.status === 0, `${path.basename(command)} failed (exit ${result.status ?? "unavailable"}); inspect locally with secrets redacted.`);
  return result.stdout.trim();
}
/** @param {Record<string, string | undefined>} env */
export function connection(env = process.env, key = "P03_DATABASE_URL", { localOnly = false } = {}) {
  invariant(env[key], `${key} is required; no implicit database is allowed.`);
  let url;
  try { url = new URL(env[key]); } catch { throw new Error(`${key} must be a PostgreSQL URL.`); }
  invariant(["postgres:", "postgresql:"].includes(url.protocol), "PostgreSQL URL required.");
  invariant(!url.searchParams.has("host") && !url.searchParams.has("service") && !url.searchParams.has("options"), "Connection overrides are forbidden.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const username = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.slice(1));
  const local = ["127.0.0.1", "::1", "localhost"].includes(hostname);
  invariant(!localOnly || local, "Restore target must be explicit loopback PostgreSQL.");
  invariant(!localOnly || /^p03_restore_[a-z0-9_]+$/.test(database), "Restore target name must start p03_restore_.");
  let projectRef = local ? "local" : null;
  const direct = hostname.match(/^db\.([a-z]{20})\.supabase\.co$/);
  const pooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(hostname) && username.match(/^postgres\.([a-z]{20})$/);
  if (direct) projectRef = direct[1];
  if (pooler) projectRef = pooler[1];
  invariant(projectRef, "Database endpoint identity is not approved Supabase or loopback.");
  invariant(local || (url.port || "5432") === "5432", "Use direct PostgreSQL or session pooler port 5432.");
  const childEnv = { ...env };
  for (const name of Object.keys(childEnv)) if (name.startsWith("PG") || /^(P03_DATABASE_URL|P03_RESTORE_DATABASE_URL)$/.test(name)) delete childEnv[name];
  Object.assign(childEnv, { PGHOST: hostname, PGPORT: url.port || "5432", PGUSER: username, PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database, PGCONNECT_TIMEOUT: "10", PGAPPNAME: "ironclad-p03-release-readonly", PGSSLMODE: local ? "disable" : "verify-full", PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=30000" });
  if (!local && env.P03_SSL_ROOT_CERT) childEnv.PGSSLROOTCERT = env.P03_SSL_ROOT_CERT;
  const bin = (name) => env.P03_PG_BIN ? path.join(env.P03_PG_BIN, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
  return { env: childEnv, projectRef, local, database, bin };
}
export function readOnlySql(db, sql, timeout = 60000) {
  return run(db.bin("psql"), ["-X", "--no-password", "-qAt", "-v", "ON_ERROR_STOP=1"], { env: db.env, timeout, input: `begin isolation level repeatable read read only;\nset local timezone = 'UTC';\nset local statement_timeout = '15s';\nset local lock_timeout = '2s';\n${sql}\nrollback;\n` });
}
export const STATE_SQL = `select jsonb_build_object(
 'database', current_database(), 'readOnly', current_setting('transaction_read_only') = 'on', 'serverNow', clock_timestamp(),
 'serverVersion', current_setting('server_version'),
 'ledger', (select coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version), '[]') from supabase_migrations.schema_migrations),
 'dependencies', (select jsonb_object_agg(signature,md5(replace(pg_get_functiondef(to_regprocedure(signature)),chr(13),''))) from (values ('ironclad_private.require_current_account_legal_acceptance()'),('public.admin_reset_tournament_match(uuid,text)'),('public.close_ironclad_player_account(text)')) as expected(signature)),
 'matchRoomSetting', (select value from public.platform_settings where key = 'match_room'),
 'matchRoomCapabilities', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'ironclad_private') and (p.proname like '%match_room%' or p.proname like '%match_message%')),
 'matchRoomTables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('match_rooms','match_messages','match_room_reads','match_room_assistance','match_room_notification_episodes')),
 'blockers', (select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'state', state, 'ageSeconds', extract(epoch from clock_timestamp()-xact_start))), '[]') from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and xact_start is not null and (state='idle in transaction' or clock_timestamp()-xact_start > interval '15 seconds')),
 'lockWaits', (select count(*) from pg_locks where not granted and database=(select oid from pg_database where datname=current_database())),
 'writeLocks', (select count(*) from pg_locks l join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace where l.pid<>pg_backend_pid() and n.nspname='public' and c.relname in ('tournament_matches','notifications','platform_settings') and l.mode in ('RowExclusiveLock','ShareUpdateExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')),
 'canSeeActivity', (select rolsuper or pg_has_role(current_user, 'pg_read_all_stats', 'member') from pg_roles where rolname=current_user)
);`;
export function capture(db, tournamentIds, { candidateSha = null, maxRows = 10000 } = {}) {
  const ids = validateTournamentIds(tournamentIds);
  const lines = readOnlySql(db, `${STATE_SQL}\n${competitionSql(ids, maxRows)}`, 90000).split(/\r?\n/);
  invariant(lines.length === 2, "Unexpected database snapshot output.");
  const state = JSON.parse(lines[0]); const rows = JSON.parse(lines[1]);
  invariant(state.readOnly === true, "Snapshot did not run read-only.");
  const tables = {}; let count = 0;
  for (const [name, spec] of Object.entries(FACTS)) {
    invariant(Array.isArray(rows[name]) && rows[name].length <= maxRows, `Row bound exceeded or table unavailable: ${name}.`);
    count += rows[name].length;
    const keys = rows[name].map((row) => row[spec.key]);
    invariant(keys.every(Boolean) && keys.length === new Set(keys).size, `Missing/duplicate fact keys: ${name}.`);
    tables[name] = { count: rows[name].length, sha256: digest(rows[name]), rows: rows[name] };
  }
  invariant(count <= 50000, "Total fingerprint row bound exceeded.");
  invariant(tables.tournaments.count === ids.length, "A selected tournament is missing or unreadable.");
  const competitionSha256 = digest(Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.sha256])));
  return { schemaVersion: 1, capturedAt: new Date().toISOString(), projectRef: db.projectRef, candidateSha, tournamentIds: ids, competitionSha256, tables, state };
}
export function compare(before, after) {
  invariant(canonical(before.tournamentIds) === canonical(after.tournamentIds), "Fingerprint tournament scope differs.");
  const differences = [];
  for (const [name, spec] of Object.entries(FACTS)) {
    const a = before.tables?.[name]; const b = after.tables?.[name];
    if (!a || !b) { differences.push(`${name}: missing table evidence`); continue; }
    const oldRows = new Map(a.rows.map((row) => [row[spec.key], row]));
    const newRows = new Map(b.rows.map((row) => [row[spec.key], row]));
    for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const oldRow = oldRows.get(id); const newRow = newRows.get(id);
      if (!oldRow || !newRow) { differences.push(`${name}/${id}: ${oldRow ? "removed" : "added"}`); continue; }
      for (const key of new Set([...Object.keys(oldRow), ...Object.keys(newRow)])) if (canonical(oldRow[key]) !== canonical(newRow[key])) differences.push(`${name}/${id}/${key}: changed`);
    }
  }
  return { pass: differences.length === 0, before: before.competitionSha256, after: after.competitionSha256, differences };
}
export function assessCompetition(snapshot) {
  const reasons = [];
  const registrations = new Map(snapshot.tables.registrations.rows.map((row) => [row.id, row]));
  const generated = new Map(snapshot.tables.generated_brackets.rows.map((row) => [row.id, row]));
  const rounds = new Map(snapshot.tables.bracket_rounds.rows.map((row) => [row.id, row]));
  const summary = { completed: 0, pairedOpen: 0, onePlayerTbd: 0, empty: 0, held: 0, pendingReview: 0 };
  for (const match of snapshot.tables.tournament_matches.rows) {
    const players = [match.player_one_registration_id, match.player_two_registration_id].filter(Boolean);
    const bracket = generated.get(match.generated_bracket_id);
    if (!bracket || rounds.get(match.round_id)?.generated_bracket_id !== match.generated_bracket_id) reasons.push(`tournament_matches/${match.id}: invalid round/bracket`);
    if (players.length === 2 && players[0] === players[1]) reasons.push(`tournament_matches/${match.id}: duplicate pairing`);
    for (const id of players) if (registrations.get(id)?.tournament_bracket_id !== bracket?.tournament_bracket_id) reasons.push(`tournament_matches/${match.id}: participant outside bracket`);
    if (match.winner_registration_id && !players.includes(match.winner_registration_id)) reasons.push(`tournament_matches/${match.id}: winner outside pairing`);
    if (match.status === "completed") summary.completed++;
    else if (players.length === 2) summary.pairedOpen++;
    else if (players.length === 1) summary.onePlayerTbd++;
    else summary.empty++;
    if (players.length < 2 && ["in_progress", "pending_review"].includes(match.status)) reasons.push(`tournament_matches/${match.id}: active match lacks two players`);
    if (match.hold_started_at && !match.hold_released_at) summary.held++;
    if (match.status === "pending_review") summary.pendingReview++;
  }
  return { reasons, summary };
}
export function matchRoomIsOff(state) {
  if (state.matchRoomSetting === null) return state.matchRoomCapabilities === 0 && state.matchRoomTables === 0;
  return state.matchRoomSetting?.enabled === false;
}
export function assessQuietWindow(snapshot, horizonMinutes = 10) {
  const now = Date.parse(snapshot.state.serverNow);
  invariant(Number.isFinite(now), "Database time unavailable for quiet-window verification.");
  const horizon = now + horizonMinutes * 60000;
  const due = (value) => value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) <= horizon;
  const reasons = [];
  for (const group of snapshot.tables.match_result_report_groups.rows) {
    if (group.status === "pending_confirmation" && !group.finalized_at && due(group.confirmation_deadline_at)) reasons.push(`match_result_report_groups/${group.id}: confirmation cron due within ${horizonMinutes} minutes`);
  }
  for (const row of snapshot.tables.registrations.rows) {
    if (row.waitlist_offer_status === "offered" && due(row.waitlist_offer_expires_at)) reasons.push(`registrations/${row.id}: waitlist cron due within ${horizonMinutes} minutes`);
  }
  const generated = new Map(snapshot.tables.generated_brackets.rows.map((row) => [row.id, row]));
  const brackets = new Map(snapshot.tables.tournament_brackets.rows.map((row) => [row.id, row]));
  for (const match of snapshot.tables.tournament_matches.rows) {
    if (match.status === "completed") continue;
    if (due(match.deadline_at) && !(match.hold_started_at && !match.hold_released_at)) reasons.push(`tournament_matches/${match.id}: deadline cron due within ${horizonMinutes} minutes`);
    const bracket = brackets.get(generated.get(match.generated_bracket_id)?.tournament_bracket_id);
    if (bracket?.launched_at && match.player_one_registration_id && match.player_two_registration_id && !match.activated_at && (!match.scheduled_at || due(match.scheduled_at))) reasons.push(`tournament_matches/${match.id}: paired match awaits authoritative lifecycle activation`);
  }
  return { horizonMinutes, reasons };
}
export function assertPrivateOutputDirectory(directory, repository) {
  const output = path.resolve(directory); const root = realpathSync(repository);
  const relative = path.relative(root, output);
  invariant(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), "Backup/evidence output must be outside the repository.");
  invariant(!existsSync(output), "Output directory already exists; use a new private directory.");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  return output;
}
