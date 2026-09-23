import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { assertPrivateOutputDirectory, capture, compare, connection, digest, fileHash, invariant, readJson, readOnlySql, run, saveJson, sha256 } from "./core.mjs";

// PostgreSQL flattens nested AND/OR nodes when CHECK constraints are restored.
// Canonicalize only their associative grouping, retaining AND vs OR precedence,
// every literal, operator and non-boolean group. Never modify the dump itself.
export function canonicalCheck(expression) {
  const tokens = expression.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|\(|\)|[^\s()]+/g) ?? [];
  let index = 0;
  function group(nested = false) {
    const parts = [];
    while (index < tokens.length) {
      const token = tokens[index++];
      if (token === ")") { invariant(nested, "Unbalanced schema CHECK expression."); return parts; }
      parts.push(token === "(" ? group(true) : token);
    }
    invariant(!nested, "Unbalanced schema CHECK expression.");
    return parts;
  }
  function normalize(parts) {
    if (parts.length === 1 && Array.isArray(parts[0])) return normalize(parts[0]);
    for (const operator of ["OR", "AND"]) {
      if (!parts.includes(operator)) continue;
      const segments = [[]];
      for (const part of parts) { if (part === operator) segments.push([]); else segments.at(-1).push(part); }
      const children = segments.map(normalize).flatMap((child) => child.op === operator ? child.children : [child]);
      return { op: operator, children };
    }
    return { atom: parts.map((part) => Array.isArray(part) ? { group: normalize(part) } : part) };
  }
  return JSON.stringify(normalize(group()));
}
export const normalizeSchema = (text) => text.replace(/\r\n/g, "\n").split("\n").filter((line) => !/^\\(?:un)?restrict\b|^-- Dumped (?:from|by)|^-- Started on|^-- Completed on/.test(line)).map((line) => {
  const check = line.match(/^(\s*CONSTRAINT \S+ CHECK )(.+?)(,?)$/);
  if (!check) return line;
  try { return `${check[1]}${canonicalCheck(check[2])}${check[3]}`; }
  catch { return line; } // Multiline constraints remain byte-for-byte checked.
}).join("\n").trim();
const ROLES_SQL = "select coalesce(jsonb_agg(rolname order by rolname), '[]') from pg_roles where rolname !~ '^pg_' and rolname <> current_user;";
const EXTENSIONS_SQL = "select coalesce(jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) order by e.extname),'[]') from pg_extension e join pg_namespace n on n.oid=e.extnamespace;";

export function validateExtensionRuntime(required, available) {
  invariant(Array.isArray(required) && required.length < 200, "Invalid source extension inventory.");
  const missing = required.filter((extension) => !available.some((item) => item.name === extension.name && item.default_version === extension.version));
  invariant(missing.length === 0, `Disposable restore runtime lacks matching default extension versions: ${missing.map((item) => `${item.name}@${item.version}`).join(", ")}. Use a compatible Supabase PostgreSQL runtime; never omit schemas/extensions from the backup.`);
}

export function checkRestoreRuntime(extensions, env = process.env) {
  const db = connection(env, "P03_RESTORE_DATABASE_URL", { localOnly: true });
  const available = JSON.parse(readOnlySql(db, "select jsonb_agg(jsonb_build_object('name',name,'default_version',default_version)) from pg_available_extensions;"));
  validateExtensionRuntime(extensions, available);
  if (extensions.some((item) => item.name === "pg_cron")) invariant(readOnlySql(db, "select current_setting('cron.launch_active_jobs',true);") === "off", "Restore runtime must set cron.launch_active_jobs=off before restoring copied jobs.");
  if (extensions.some((item) => ["pg_net", "http"].includes(item.name))) {
    invariant(db.containerAttestation?.name === env.P03_RESTORE_CONTAINER, "Hosted backup requires a positively attested dedicated local Docker runtime with no outbound network.");
  }
  const count = Number(readOnlySql(db, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast' and c.relkind in ('r','p','v','m');"));
  invariant(count === 0, "Restore target is not empty; create a new disposable local database.");
  return db;
}
export function restorePreflight(directory, env = process.env) {
  const manifest = verifyBackup(directory);
  const db = checkRestoreRuntime(manifest.extensions, env);
  return { db, manifest };
}

export function backup({ repository, directory, tournamentIds, candidateSha, expectedProjectRef, env = process.env }) {
  const db = connection(env);
  invariant(db.projectRef === expectedProjectRef, "Backup source project mismatch.");
  const output = assertPrivateOutputDirectory(directory, repository);
  const pre = capture(db, tournamentIds, { candidateSha });
  const roles = JSON.parse(readOnlySql(db, ROLES_SQL));
  const extensions = JSON.parse(readOnlySql(db, EXTENSIONS_SQL));
  saveJson(path.join(output, "roles.json"), roles);
  saveJson(path.join(output, "critical-before.json"), pre);
  const dumpEnv = { ...db.env, PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=2000" };
  run(db.bin("pg_dump"), ["--no-password", "--format=custom", "--lock-wait-timeout=2s", "--file", path.join(output, "database.dump")], { env: dumpEnv, timeout: 300000 });
  run(db.bin("pg_dump"), ["--no-password", "--schema-only", "--no-owner", "--no-privileges", "--lock-wait-timeout=2s", "--file", path.join(output, "schema.sql")], { env: dumpEnv, timeout: 120000 });
  const archiveList = run(db.bin("pg_restore"), ["--list", path.join(output, "database.dump")], { env: db.env });
  invariant(archiveList.includes("TABLE DATA public tournament_matches"), "Archive is missing tournament match data.");
  const post = capture(db, tournamentIds, { candidateSha });
  const comparison = compare(pre, post);
  invariant(comparison.pass, "Competition changed during backup; select a quiet window and take a new backup.");
  saveJson(path.join(output, "critical-after.json"), post);
  const files = ["database.dump", "schema.sql", "roles.json", "critical-before.json", "critical-after.json"].map((name) => ({ name, sha256: fileHash(path.join(output, name)), bytes: statSync(path.join(output, name)).size }));
  const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), sourceProjectRef: db.projectRef, sourceServerVersion: pre.state.serverVersion, extensions, candidateSha, tournamentIds: pre.tournamentIds, competitionSha256: pre.competitionSha256, files, archiveListSha256: sha256(archiveList), schemaSha256: sha256(normalizeSchema(readFileSync(path.join(output, "schema.sql"), "utf8"))), limitations: "Logical database backup only; no PITR, Storage object bytes, Clerk identities, platform secrets or in-flight changes. Archive contains sensitive data; restrict filesystem ACLs and retention. Hosted Supabase extensions require a compatible disposable runtime; native synthetic rehearsal is not proof of hosted restoration." };
  saveJson(path.join(output, "manifest.json"), manifest);
  return manifest;
}

export function verifyBackup(directory) {
  const manifest = readJson(path.join(directory, "manifest.json"));
  invariant(manifest.schemaVersion === 1 && Array.isArray(manifest.files), "Backup manifest format is invalid.");
  const required = ["database.dump", "schema.sql", "roles.json", "critical-before.json", "critical-after.json"];
  invariant(manifest.files.length === required.length && required.every((name) => manifest.files.some((file) => file.name === name)), "Backup file inventory differs.");
  for (const file of manifest.files) {
    const filename = path.join(directory, file.name);
    invariant(file.bytes > 0 && statSync(filename).size === file.bytes && fileHash(filename) === file.sha256, `Backup checksum mismatch: ${file.name}.`);
  }
  const before = readJson(path.join(directory, "critical-before.json"));
  const after = readJson(path.join(directory, "critical-after.json"));
  invariant(before.projectRef === manifest.sourceProjectRef && before.candidateSha === manifest.candidateSha && before.competitionSha256 === manifest.competitionSha256 && compare(before, after).pass, "Backup fingerprint binding mismatch.");
  return manifest;
}

export function restore({ directory, env = process.env }) {
  const { manifest, db } = restorePreflight(directory, env);
  const writeEnv = { ...db.env, PGAPPNAME: "ironclad-p03-disposable-restore", PGOPTIONS: "-c statement_timeout=120000 -c lock_timeout=2000" };
  const roles = readJson(path.join(directory, "roles.json"));
  invariant(Array.isArray(roles) && roles.length < 200 && roles.every((role) => typeof role === "string" && /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(role)), "Unexpected role inventory; review before restore.");
  const existing = JSON.parse(readOnlySql(db, "select jsonb_agg(rolname) from pg_roles;"));
  const roleSql = roles.filter((role) => !existing.includes(role)).map((role) => `create role "${role}" nologin;`).join("\n");
  if (roleSql) run(db.bin("psql"), ["-X", "--no-password", "-q", "-v", "ON_ERROR_STOP=1"], { env: writeEnv, input: `begin;\n${roleSql}\ncommit;` });
  // The only mutation path in release tooling is this separately invoked,
  // loopback-only empty disposable restore. Gate never calls this function.
  run(db.bin("pg_restore"), ["--no-password", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", db.database, path.join(directory, "database.dump")], { env: writeEnv, timeout: 300000 });
  const restored = capture(db, manifest.tournamentIds, { candidateSha: manifest.candidateSha });
  const comparison = compare(readJson(path.join(directory, "critical-before.json")), restored);
  const restoredSchema = run(db.bin("pg_dump"), ["--no-password", "--schema-only", "--no-owner", "--no-privileges", "--lock-wait-timeout=2s"], { env: db.env, timeout: 120000 });
  const schemaSha256 = sha256(normalizeSchema(restoredSchema));
  const extensionsMatch = digest(JSON.parse(readOnlySql(db, EXTENSIONS_SQL))) === digest(manifest.extensions);
  const result = { schemaVersion: 1, checkedAt: new Date().toISOString(), candidateSha: manifest.candidateSha, sourceProjectRef: manifest.sourceProjectRef, targetProjectRef: "local", targetDatabase: db.database, backupManifestSha256: fileHash(path.join(directory, "manifest.json")), archiveSha256: manifest.files.find((file) => file.name === "database.dump").sha256, comparison, schemaSha256, schemaMatches: schemaSha256 === manifest.schemaSha256, extensionsMatch, passed: comparison.pass && schemaSha256 === manifest.schemaSha256 && extensionsMatch };
  saveJson(path.join(directory, "restore-validation.json"), result);
  invariant(result.passed, "Restore validation failed: competition or schema differs. Inspect restore-validation.json locally.");
  return result;
}

export function verifyRestoredBackup(directory, { candidateSha, projectRef, maxAgeMinutes = 60, now = Date.now() }) {
  const manifest = verifyBackup(directory);
  const result = readJson(path.join(directory, "restore-validation.json"));
  invariant(manifest.candidateSha === candidateSha && manifest.sourceProjectRef === projectRef, "Backup candidate/project binding mismatch.");
  invariant(now - Date.parse(manifest.createdAt) >= 0 && now - Date.parse(manifest.createdAt) <= maxAgeMinutes * 60000, "Backup is stale; repeat immediately before release.");
  invariant(result.passed === true && result.comparison?.pass === true && result.comparison.before === manifest.competitionSha256 && result.comparison.after === manifest.competitionSha256 && result.schemaMatches === true && result.extensionsMatch === true && result.schemaSha256 === manifest.schemaSha256 && result.backupManifestSha256 === fileHash(path.join(directory, "manifest.json")) && result.archiveSha256 === manifest.files.find((file) => file.name === "database.dump").sha256 && result.candidateSha === candidateSha && result.sourceProjectRef === projectRef && result.targetProjectRef === "local" && /^p03_restore_/.test(result.targetDatabase), "Restore evidence is invalid or bound to another backup.");
  invariant(digest(result.comparison.differences) === digest([]), "Restore comparison contains differences.");
  return manifest;
}
