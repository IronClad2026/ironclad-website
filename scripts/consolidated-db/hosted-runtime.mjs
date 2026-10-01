// Dedicated GitHub-hosted Linux rehearsal. All SQL, archives and identities are
// synthetic; the exact Supabase image supplies real extension binaries.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeSchema } from "../p03-release/backup.mjs";
import { verifyPackage } from "./package.mjs";
import { verifyPostDeploymentPackage } from "./post-deployment.mjs";
import { boundedSchemaDiff } from "./schema-diagnostics.mjs";

export const image = "supabase/postgres:17.6.1.127";
export const nodeImage = "node:22.12.0-bookworm-slim";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = "consolidated_rehearsal";
const port = "56623";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const extensions = JSON.parse(readFileSync(path.join(root, "scripts/p03-release/production-extensions.json"), "utf8")).extensions;

export function assertHostedContext(platform, env, repository = root) {
  assert(platform === "linux" && env.GITHUB_ACTIONS === "true" && env.RUNNER_TEMP && env.GITHUB_WORKSPACE,
    "This synthetic runtime requires a GitHub-hosted Linux job");
  assert.equal(path.resolve(env.GITHUB_WORKSPACE), path.resolve(repository), "Exact checkout workspace required");
  assert(!env.DOCKER_HOST || env.DOCKER_HOST === "unix:///var/run/docker.sock", "Remote Docker forbidden");
  assert(!env.DOCKER_TLS_VERIFY && !env.DOCKER_CERT_PATH, "Remote Docker TLS configuration forbidden");
  assert.match(env.CONSOLIDATED_EXPECTED_SHA ?? "", /^[a-f0-9]{40}$/, "Exact candidate SHA required");
}

export function assertNodeRuntimeState(state, expected) {
  assert.equal(state.Config.Image, nodeImage);
  assert.equal(state.Image, expected.imageId, "Exact pulled Node image identity required");
  assert([`container:${expected.databaseName}`, `container:${expected.databaseId}`].includes(state.HostConfig.NetworkMode),
    "Node must share only its attested database network namespace");
  assert.equal(Object.keys(state.HostConfig.PortBindings ?? {}).length, 0, "Node published ports forbidden");
  assert.equal(state.HostConfig.ReadonlyRootfs, true);
  assert.equal(state.Config.User, "node");
  assert.deepEqual(state.HostConfig.CapDrop, ["ALL"]);
  assert(state.HostConfig.SecurityOpt?.some(value => /^no-new-privileges(?::true)?$/.test(value)), "Node privilege escalation forbidden");
  assert.deepEqual(Object.keys(state.HostConfig.Tmpfs ?? {}), ["/tmp"], "Only bounded Node scratch storage permitted");
  const scratch = new Set(state.HostConfig.Tmpfs["/tmp"].split(","));
  for (const option of ["rw", "noexec", "nosuid", "size=64m", "mode=1777"]) {
    assert(scratch.has(option), "Node scratch storage must remain bounded, non-executable and unprivileged");
  }
  const binds = state.Mounts.filter(mount => mount.Type === "bind");
  assert.equal(binds.length, 2, "Only checkout and pinned protocol-client host mounts permitted");
  for (const [destination, source] of [["/work", expected.repository], ["/client/node_modules", expected.clientModules]]) {
    assert.equal(binds.filter(mount => mount.Destination === destination && mount.Source === source && mount.RW === false).length, 1,
      "Node host mounts must remain exact and read-only");
  }
  // Engine versions may include the configured scratch tmpfs in Mounts.
  assert(state.Mounts.every(mount => mount.Type === "bind" || (mount.Type === "tmpfs" && mount.Destination === "/tmp")),
    "Additional Node mounts forbidden");
}

export const startup = `set -eu
initdb -D /tmp/consolidated-data -U postgres --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale >/dev/null
exec postgres -D /tmp/consolidated-data -c listen_addresses=127.0.0.1 -c port=${port} -c unix_socket_directories=/tmp -c shared_preload_libraries=pg_cron,pg_net,pg_stat_statements -c cron.database_name=${database} -c cron.launch_active_jobs=off -c pg_net.database_name=postgres -c max_connections=40`;

export function boundedSyntheticDiagnostic(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL REDACTED]")
    .replace(/\b(authorization|api[-_]?key|password|secret|token)\s*[:=]\s*[^\r\n,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(?:sk_(?:live|test)_|sb_secret_)[a-zA-Z0-9_-]+/g, "[CREDENTIAL REDACTED]")
    .replace(/\b[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\b/g, "[JWT REDACTED]")
    .replace(/[^\n\t\x20-\x7e]/g, "?")
    .slice(-4096);
}

export function formatSchemaDiagnostic(diff, phase) {
  const report = { syntheticOnly: true, phase, ...diff, changes: [...diff.changes] };
  let output = JSON.stringify(report);
  if (Buffer.byteLength(output) > 16384) {
    // Keep object/field hashes even when exact CHECK or ACL metadata is large.
    report.truncated = true;
    report.changes = report.changes.map(change => ({ ...change,
      fields: change.fields?.map(field => Object.fromEntries(Object.entries(field).filter(([key]) => key !== "source" && key !== "restored"))) }));
    output = JSON.stringify(report);
  }
  while (Buffer.byteLength(output) > 16384 && report.changes.length) {
    report.changes.pop(); report.truncated = true; output = JSON.stringify(report);
  }
  assert(Buffer.byteLength(output) <= 16384, "Schema diagnostic byte limit exceeded");
  return output;
}

function command(binary, args, options = {}) {
  assert(["docker", "git"].includes(binary), "Only local Docker and checkout identity commands are allowed");
  const { emptyContainerDiagnostic, ...spawnOptions } = options;
  const result = spawnSync(binary, args, {
    encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    cwd: root, ...spawnOptions,
  });
  // Only a fixed Node --version command in the unseeded synthetic cluster may
  // emit bounded stderr. Archive bytes and SQL output remain suppressed.
  if ((result.error || result.status !== 0) && emptyContainerDiagnostic) {
    assert.equal(binary, "docker");
    assert.equal(args[0], "exec");
    assert.equal(args.at(-2), "node");
    assert.equal(args.at(-1), "--version");
    console.error(JSON.stringify({ syntheticOnly: true, phase: "empty-container-node-version", status: result.status,
      error: result.error?.code, diagnostic: boundedSyntheticDiagnostic(result.stderr) }));
  }
  assert(!result.error && result.status === 0, `Synthetic ${binary} operation failed (${result.error?.code ?? result.status}); no live endpoint is configured`);
  return result.stdout?.trim() ?? "";
}

const snapshotScript = String.raw`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {Client}=createRequire('/client/node_modules/pg/lib/index.js')('/client/node_modules/pg/lib/index.js');
const client=new Client({host:'127.0.0.1',port:56623,database:'consolidated_rehearsal',user:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000});
const quote=value=>String.fromCharCode(34)+value.replaceAll(String.fromCharCode(34),String.fromCharCode(34).repeat(2))+String.fromCharCode(34);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
await client.connect();
try {
  const guard=(await client.query("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal' as ok")).rows[0];
  assert.equal(guard.ok,true,'Fixed disposable endpoint required');
  await client.query('begin transaction isolation level repeatable read read only');
  const relations=(await client.query("select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast' and c.relkind in ('r','p') order by n.nspname,c.relname")).rows;
  const tables={};
  for(const relation of relations) {
    const name=quote(relation.schema)+'.'+quote(relation.name);
    const rows=(await client.query('select to_jsonb(t)::text as fact from '+name+' t order by to_jsonb(t)::text collate "C"')).rows.map(row=>row.fact);
    tables[relation.schema+'.'+relation.name]={count:rows.length,sha256:hash(rows)};
  }
  const sequences={};
  const names=(await client.query("select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast' and c.relkind='S' order by n.nspname,c.relname")).rows;
  for(const relation of names) sequences[relation.schema+'.'+relation.name]=(await client.query('select last_value::text,is_called from '+quote(relation.schema)+'.'+quote(relation.name))).rows[0];
  const roles=(await client.query("select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig from pg_roles where rolname !~ '^pg_' order by rolname")).rows;
  const memberships=(await client.query("select r.rolname as role,m.rolname as member,g.rolname as grantor,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where r.rolname !~ '^pg_' order by r.rolname,m.rolname,g.rolname")).rows;
  const extensions=(await client.query("select e.extname as name,e.extversion as version,n.nspname as schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname")).rows;
  const serverVersion=(await client.query('show server_version')).rows[0].server_version;
  assert.equal((await client.query("select current_setting('cron.launch_active_jobs') as value")).rows[0].value,'off');
  assert.equal((await client.query("select current_setting('pg_net.database_name') as value")).rows[0].value,'postgres');
  await client.query('rollback');
  console.log(JSON.stringify({tables,sequences,rolesSha256:hash(roles),membershipsSha256:hash(memberships),extensions,serverVersion}));
} finally {await client.end();}
`;

export async function rehearseHostedRuntime() {
  assertHostedContext(process.platform, process.env);
  const context = JSON.parse(command("docker", ["context", "inspect"]))[0];
  assert.equal(context.Endpoints?.docker?.Host, "unix:///var/run/docker.sock", "Local runner Docker socket required");
  const candidateSha = command("git", ["rev-parse", "HEAD"]);
  assert.equal(candidateSha, process.env.CONSOLIDATED_EXPECTED_SHA, "Wrong immutable candidate checkout");
  command("git", ["diff", "--quiet", "HEAD", "--"]);
  const reviewedMigrations = verifyPackage().map(({ file, sha256 }) => ({ file, sha256 }));
  const reviewedPostdeployment = verifyPostDeploymentPackage().sha256;
  const temporary = realpathSync(process.env.RUNNER_TEMP);
  const clientRoot = realpathSync(path.join(temporary, "consolidated-pg-client"));
  assert.equal(path.dirname(clientRoot), temporary, "The pinned client must stay inside runner temporary storage");
  const pg = JSON.parse(readFileSync(path.join(clientRoot, "node_modules/pg/package.json"), "utf8"));
  assert.equal(pg.version, "8.16.3", "Exact disposable pg client required");
  const suffix = randomUUID().slice(0, 8);
  const network = `consolidated-ci-${suffix}`;
  const output = path.join(temporary, `consolidated-hosted-${suffix}`);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const created = [];
  let networkCreated = false;
  let report;
  let cleanupFailed = false;
  let expectedImageId;
  let expectedNodeImageId;
  const nodeContainers = new Map();
  const docker = (args, options) => command("docker", args, options);
  const sql = (name, query) => docker(["exec", "-i", name, "psql", "-X", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1"], { input: query });
  const runtime = name => { const value = nodeContainers.get(name); assert(value, "Attested matching Node namespace required"); return value; };
  const node = (name, script, ...args) => docker(["exec", "--workdir", "/work", "-e", "CONSOLIDATED_PROVIDER_MODE=actual-supabase", "-e", "CONSOLIDATED_PG_CLIENT_MODULE=/client/node_modules/pg/lib/index.js", "-e", "CONSOLIDATED_EVIDENCE_FILE=/tmp/consolidated-db-rehearsal.json", runtime(name), "node", script, ...args], { timeout: 600000 });
  const snapshot = name => JSON.parse(docker(["exec", "-i", runtime(name), "node", "--input-type=module"], { input: snapshotScript }));
  const applicationCapture = name => JSON.parse(node(name, "scripts/consolidated-db/capture.mjs"));
  const schema = name => normalizeSchema(docker(["exec", name, "pg_dump", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "--schema-only", database]));

  async function start(name) {
    docker(["run", "--detach", "--name", name, "--network", network, "--user", "postgres", "--mount", `type=bind,source=${root},target=/work,readonly`, "--entrypoint", "sh", image, "-c", startup]);
    created.push(name);
    const state = JSON.parse(docker(["inspect", name]))[0];
    assert.equal(state.Config.Image, image);
    assert.equal(state.Image, expectedImageId, "Exact pulled image identity required");
    assert.equal(Object.keys(state.HostConfig.PortBindings ?? {}).length, 0, "Published container ports forbidden");
    assert.deepEqual(Object.keys(state.NetworkSettings.Networks), [network]);
    assert(state.Mounts.some(mount => mount.Destination === "/work" && mount.RW === false), "Checkout must be mounted read-only");
    assert(state.Mounts.every(mount => mount.Destination === "/work" && mount.RW === false), "No writable host mount permitted");
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-p", port, "-U", "postgres"], { timeout: 2000 }); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    if (!ready) emptyStartupDiagnostic(name);
    assert(ready, "Disposable cluster did not start");
    docker(["exec", name, "createdb", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "--template=template0", database]);
    assert.equal(sql(name, "select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal';"), "t");
    await startNodeRuntime(name, state.Id);
    return name;
  }

  async function startNodeRuntime(databaseName, databaseId) {
    const name = `${databaseName}-node`;
    // The official Debian Node runtime avoids copying a glibc executable into
    // the exact Alpine/Nix Supabase runtime. Shared network namespace preserves
    // the existing literal loopback database guard without exposing a port.
    docker(["run", "--detach", "--name", name, "--network", `container:${databaseName}`, "--user", "node", "--read-only",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m,mode=1777",
      "--mount", `type=bind,source=${root},target=/work,readonly`,
      "--mount", `type=bind,source=${path.join(clientRoot, "node_modules")},target=/client/node_modules,readonly`,
      "--entrypoint", "node", nodeImage, "--eval", "setInterval(() => {}, 2147483647)"]);
    created.push(name);
    const state = JSON.parse(docker(["inspect", name]))[0];
    assertNodeRuntimeState(state, { imageId: expectedNodeImageId, databaseName, databaseId,
      repository: path.resolve(root), clientModules: path.join(clientRoot, "node_modules") });
    try {
      assert.equal(docker(["exec", name, "node", "--version"], { emptyContainerDiagnostic: true }), "v22.12.0", "Exact sidecar Node version required");
    } catch (error) { emptyStartupDiagnostic(name); throw error; }
    nodeContainers.set(databaseName, name);
  }

  function emptyStartupDiagnostic(name) {
    // Startup calls this before replaying any application SQL or seeding data.
    // Only the exact random container created by this invocation is inspected.
    assert(created.includes(name));
    const result = spawnSync("docker", ["inspect", name], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 });
    try {
      const state = JSON.parse(result.stdout)[0].State;
      console.error(JSON.stringify({ syntheticOnly: true, phase: "empty-container-startup", container: name,
        status: state.Status, exitCode: state.ExitCode, oomKilled: state.OOMKilled }));
    } catch { console.error("Synthetic empty-container state unavailable."); }
    const logs = spawnSync("docker", ["logs", "--tail", "30", name], { encoding: "utf8", timeout: 5000, maxBuffer: 16384 });
    console.error(JSON.stringify({ syntheticOnly: true, phase: "empty-container-startup-log",
      diagnostic: boundedSyntheticDiagnostic(`${logs.stdout ?? ""}${logs.stderr ?? ""}`) }));
  }

  function installExtensions(name) {
    sql(name, "create schema extensions; create schema vault;");
    for (const extension of extensions) {
      assert.match(extension.name, /^[a-z_][a-z0-9_-]*$/);
      assert.match(extension.schema, /^[a-z_][a-z0-9_]*$/);
      assert.match(extension.version, /^[0-9.]+$/);
      if (extension.name !== "plpgsql") sql(name, `create extension "${extension.name}" with schema "${extension.schema}" version '${extension.version}';`);
    }
    const actual = JSON.parse(sql(name, "select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace;"));
    assert.deepEqual(actual, [...extensions].sort((a, b) => a.name.localeCompare(b.name)), "All seven real Production extension versions/schemas must match");
  }

  function archiveAndRestore(source, target, phase) {
    const before = snapshot(source);
    const applicationBefore = applicationCapture(source);
    const sourceSchema = schema(source);
    const archive = `/tmp/${phase}.dump`;
    docker(["exec", source, "pg_dump", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "--format=custom", "--file", archive, database]);
    const roles = docker(["exec", source, "pg_dumpall", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "--roles-only", "--no-role-passwords"]);
    assert(!/PASSWORD\s+'[^']+'/i.test(roles), "Synthetic roles archive must not contain passwords");
    docker(["exec", "-i", target, "psql", "-X", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: roles.replace(/^CREATE ROLE postgres;\r?$/m, "-- Existing fresh-cluster postgres role") });
    const hostArchive = path.join(output, `${phase}.dump`);
    docker(["cp", `${source}:${archive}`, hostArchive]);
    docker(["cp", hostArchive, `${target}:${archive}`]);
    docker(["exec", target, "pg_restore", "--no-password", "--exit-on-error", "--single-transaction", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "--dbname", database, archive], { timeout: 300000 });
    assert.deepEqual(snapshot(source), before, "Source changed during complete logical backup");
    const restored = snapshot(target);
    assert.deepEqual(restored, before, "Restored table contents, sequences, roles, memberships or extension inventory differ");
    const applicationRestored = applicationCapture(target);
    if (applicationRestored.schema.sha256 !== applicationBefore.schema.sha256) {
      try {
        const sourceObjects = JSON.parse(node(source, "scripts/consolidated-db/capture.mjs", "--schema-objects"));
        const restoredObjects = JSON.parse(node(target, "scripts/consolidated-db/capture.mjs", "--schema-objects"));
        console.error(formatSchemaDiagnostic(boundedSchemaDiff(sourceObjects, restoredObjects, 24), `${phase}-application-schema-mismatch`));
      } catch {
        console.error(JSON.stringify({ syntheticOnly: true, phase: `${phase}-application-schema-mismatch`, diagnosticUnavailable: true }));
      }
    }
    assert.deepEqual(applicationRestored, applicationBefore, "Restored application schema/data/ledger/retention fingerprint differs");
    assert.equal(schema(target), sourceSchema, "Full restored schema, owners or permissions differ");
    return { phase, archiveSha256: sha256(readFileSync(hostArchive)), snapshotSha256: sha256(JSON.stringify(before)), applicationSha256: sha256(JSON.stringify(applicationBefore)), schemaSha256: sha256(sourceSchema), tableCount: Object.keys(before.tables).length, sequenceCount: Object.keys(before.sequences).length, restored: true };
  }

  try {
    docker(["pull", image], { timeout: 300000 });
    const imageMetadata = JSON.parse(docker(["image", "inspect", image]))[0];
    expectedImageId = imageMetadata.Id;
    assert(Array.isArray(imageMetadata.RepoDigests) && imageMetadata.RepoDigests.length > 0, "Pulled image digest required");
    docker(["pull", nodeImage], { timeout: 300000 });
    const nodeImageMetadata = JSON.parse(docker(["image", "inspect", nodeImage]))[0];
    expectedNodeImageId = nodeImageMetadata.Id;
    assert(Array.isArray(nodeImageMetadata.RepoDigests) && nodeImageMetadata.RepoDigests.length > 0, "Pulled Node image digest required");
    docker(["network", "create", "--internal", network]); networkCreated = true;
    assert.equal(JSON.parse(docker(["network", "inspect", network]))[0].Internal, true);
    const source = await start(`consolidated-source-${suffix}`);
    const beforeTarget = await start(`consolidated-before-${suffix}`);
    const afterTarget = await start(`consolidated-after-${suffix}`);
    installExtensions(source);
    console.log("Verified seven real extension names, versions and schemas on the exact isolated Supabase image.");
    node(source, "scripts/consolidated-db/replay-baseline.mjs");
    node(source, "scripts/consolidated-db/rehearse.mjs", "--seed-only");
    const before = archiveAndRestore(source, beforeTarget, "before-consolidated");
    console.log("Verified full seeded baseline archive and restore, including owners, grants, contents, sequences and retained history.");
    node(source, "scripts/consolidated-db/rehearse.mjs", "--seeded");
    docker(["cp", `${runtime(source)}:/tmp/consolidated-db-rehearsal.json`, path.join(output, "consolidated-db-rehearsal.json")]);
    const rehearsal = JSON.parse(readFileSync(path.join(output, "consolidated-db-rehearsal.json"), "utf8"));
    assert.equal(rehearsal.status, "PASS"); assert.equal(rehearsal.providerMode, "actual-supabase");
    assert.equal(rehearsal.baselineLedgerEntries, 153); assert.equal(rehearsal.candidateLedgerEntries, 159);
    assert.deepEqual(rehearsal.migrations, reviewedMigrations);
    assert.equal(rehearsal.postdeployment, reviewedPostdeployment);
    const after = archiveAndRestore(source, afterTarget, "after-consolidated");
    console.log("Verified consolidated migration, legal and postdeployment rehearsal, followed by a complete candidate archive and restore.");
    report = { schemaVersion: 1, status: "PASS", candidateSha, checkedAt: new Date().toISOString(), image, imageId: imageMetadata.Id, imageDigests: imageMetadata.RepoDigests,
      nodeRuntime: { image: nodeImage, imageId: nodeImageMetadata.Id, imageDigests: nodeImageMetadata.RepoDigests, version: "22.12.0", network: "attested matching database namespace", hostMounts: "read-only" },
      extensions, before, after, rehearsal,
      productionDataRead: false, productionDataMutated: false,
      limitations: ["Synthetic Auth/Storage metadata and identities; schema-only canonical Realtime provider reproduction", "No hosted WebSocket, Clerk session, Storage object byte or external media provider proof", "These synthetic complete logical archives never replace the fresh authorized release-day Production backup and restore receipt"] };
  } finally {
    for (const name of created.reverse()) { try { docker(["rm", "--force", name]); } catch { cleanupFailed = true; } }
    if (networkCreated) { try { docker(["network", "rm", network]); } catch { cleanupFailed = true; } }
  }
  assert(!cleanupFailed, "Dedicated disposable resource cleanup failed; CI must stop");
  assert(report, "Complete actual-extension and both restore receipts required");
  const evidence = path.join(root, "test-results/consolidated-hosted-runtime-evidence.json");
  mkdirSync(path.dirname(evidence), { recursive: true });
  writeFileSync(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log("CONSOLIDATED ACTUAL SUPABASE EXTENSION AND BOTH COMPLETE RESTORES: PASS");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await rehearseHostedRuntime();
}
