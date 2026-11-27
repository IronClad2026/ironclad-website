import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bin = resolve(root, "../release-execution-tools/postgresql-17.11/pgsql/bin");
const run = resolve(root, ".release-local", `patch2-match-staff-${randomUUID()}`);
const data = resolve(run, "data");
const host = "127.0.0.1";
const port = "56766";
const password = randomBytes(32).toString("base64url");
const passwordFile = resolve(run, "init-password");
const osKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS"]);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => osKeys.has(key.toUpperCase())));
const read = async (path) => (await readFile(resolve(root, path), "utf8")).replace(/\r\n/g, "\n");
const migration = "supabase/migrations/20261114064733_patch2_match_staff_authorization.sql";
const authorities = [
  ["20261113010000_patch2_durable_account_closure.sql", "ironclad_private.patch2_account_state"],
  ["20261113045827_patch2_verified_staff_access.sql", "public.get_patch2_admin_account_state"],
  ["20261113045827_patch2_verified_staff_access.sql", "ironclad_private.require_patch2_open_account"],
  ["20261113050025_patch2_public_gaming_profile_acknowledgement.sql", "ironclad_private.public_gaming_profile_notice_version"],
  ["20261113050025_patch2_public_gaming_profile_acknowledgement.sql", "ironclad_private.public_gaming_profile_notice_satisfied"],
  ["20260919011425_match_room_phase_one.sql", "ironclad_private.match_message_projection"],
  ["20260920014644_match_room_production_hardening.sql", "public.get_match_room_enabled"],
  ["20260920014644_match_room_production_hardening.sql", "ironclad_private.match_room_writes_enabled"],
  ["20260920014644_match_room_production_hardening.sql", "ironclad_private.require_match_room_enabled"],
  ["20260920014644_match_room_production_hardening.sql", "ironclad_private.match_room_projection"],
];
const baseline = await Promise.all(authorities.map(async ([file, name]) => {
  const source = await read(`supabase/migrations/${file}`);
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replace(".", "\\.")}\\(`, "i"));
  const end = source.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start, `Missing exact baseline authority ${name}`);
  return source.slice(start, end + 3);
}));
function command(name, args, extraEnv = env) {
  return spawnSync(resolve(bin, `${name}.exe`), args, { cwd: root, env: extraEnv, encoding: "utf8",
    windowsHide: true, timeout: 30000 });
}
function requireSuccess(result) {
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout;
}
const connect = ["-X", "-w", "-qAt", "-h", host, "-p", port, "-U", "postgres", "-d", "postgres"];
const psqlEnv = { ...env, PGPASSWORD: password, PGCONNECT_TIMEOUT: "1" };
await mkdir(run, { recursive: true });
await writeFile(passwordFile, `${password}\n`, { flag: "wx" });
const baselinePath = resolve(run, "baseline.sql");
await writeFile(baselinePath, baseline.join("\n\n"), { flag: "wx" });
let server;
try {
  assert.notEqual(command("pg_isready", ["-h", host, "-p", port, "-t", "1"]).status, 0,
    "Dedicated disposable PostgreSQL port is already in use");
  requireSuccess(command("initdb", ["-D", data, "-U", "postgres", "--auth=scram-sha-256",
    "--pwfile", passwordFile, "--encoding=UTF8", "--locale=C", "--no-instructions"]));
  await unlink(passwordFile);
  server = spawn(resolve(bin, "postgres.exe"), ["-D", data, "-h", host, "-p", port,
    "-c", "unix_socket_directories=", "-c", "max_connections=8", "-c", "shared_buffers=32MB"],
  { cwd: root, env, windowsHide: true, stdio: "ignore" });
  server.on("error", (error) => { console.error(error.message); });
  let ready = false;
  for (let i = 0; i < 70 && server.exitCode === null; i++) {
    const identity = command("psql", [...connect, "-c", "select current_setting('data_directory')"], psqlEnv);
    if (identity.status === 0) {
      assert.equal(resolve(identity.stdout.trim()), data, "Unexpected PostgreSQL cluster on loopback");
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready, "Disposable PostgreSQL did not start");
  const output = requireSuccess(command("psql", [...connect, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    "-v", `match_staff_baseline=${baselinePath.replaceAll("\\", "/")}`,
    "-f", "tests/database/patch2-match-staff-authorization.sql"], psqlEnv));
  const checks = output.split(/\r?\n/).filter(line => line.startsWith("PASS "));
  assert.ok(checks.length >= 35, "Expected focused authorization checks did not run");
  const sha256 = createHash("sha256").update(await read(migration)).digest("hex");
  const report = { passed: true, target: "disposable localhost PostgreSQL 17", migration, sha256, checks,
    limitation: "Synthetic claims and minimal schema. Real Clerk, PostgREST, hosted Realtime and production constraints are not exercised." };
  await writeFile(resolve(run, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(checks.join("\n"));
  console.log(`${checks.length} native database checks passed. Report ${resolve(run, "report.json")}`);
} finally {
  await unlink(passwordFile).catch(() => {});
  if (server && server.exitCode === null) {
    const result = command("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "15", "stop"]);
    if (result.status !== 0) server.kill();
    assert.equal(result.status, 0, result.stderr);
  }
}
