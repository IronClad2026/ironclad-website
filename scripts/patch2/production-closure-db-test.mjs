import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Offline SQL rehearsal only. No env files, remote client, hosted connection,
// cron/worker, Storage bytes or network-provider fallback is available here.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKSPACE = resolve(ROOT, "..");
const TOOLS = resolve(WORKSPACE, "release-execution-tools");
const BIN = resolve(TOOLS, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(TOOLS, "pg-client/node_modules/pg"));
const HOST = "127.0.0.1", PORT = 56738;
const EVIDENCE = resolve(ROOT, ".release-local/production-closure-20261105");
const RUN = resolve(ROOT, ".release-local", `production-closure-run-${randomUUID()}`);
assert.ok(RUN.startsWith(`${resolve(ROOT, ".release-local")}${sep}`));
const DATA = resolve(RUN, "data"), passwordFile = resolve(RUN, "init-password");
const password = randomBytes(32).toString("base64url");
const OS_ENVIRONMENT_KEYS = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS"]);
assert.ok(Object.keys(process.env).every(key => OS_ENVIRONMENT_KEYS.has(key.toUpperCase())),
  "Launch Node with an explicit OS-only environment; do not inherit provider credentials, proxies or NODE_OPTIONS");
assert.ok(process.execArgv.some(arg => arg.endsWith("block-remote-network.cjs")),
  "Launch with the existing local network-blocking preload");
assert.match(net.Socket.prototype.connect.toString(), /checkConnect/, "Loopback network guard is missing");
const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => OS_ENVIRONMENT_KEYS.has(key.toUpperCase())));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const raw = (await readFile(resolve(EVIDENCE, "catalog.json"), "utf8")).trimEnd();
const SNAPSHOT_SHA = "a0325d29c4e3db93d92ffbfb3ff4fd2abb31dc919576b1cd2f68d9839a016eb3";
assert.equal(sha(raw), SNAPSHOT_SHA, "Frozen metadata snapshot changed");
const snapshot = JSON.parse(raw), cat = snapshot.catalog;
const policyRaw = (await readFile(resolve(EVIDENCE, "policy-supplement.json"), "utf8")).trimEnd();
const fidelityRaw = (await readFile(resolve(EVIDENCE, "fidelity-supplement.json"), "utf8")).trimEnd();
assert.equal(sha(policyRaw), "098a0764f421139468a699b1b3f835b1b7d2f93bed0997e3a9364c6259cf485c");
assert.equal(sha(fidelityRaw), "4c3b5c7643c2df41e08a368559f1307a07498362f8bdcf7d4b51c0e450b4f062");
const policySnapshot = JSON.parse(policyRaw), fidelity = JSON.parse(fidelityRaw);
const legacyFunctionSources = [
  ["20260919011425_match_room_phase_one.sql", "ironclad_private", "match_room_access", "uuid,text", "58cf564413ba1a9eee1cda58ddfd7205f4a32cd26114fab49bd21ab27b5d8b0a"],
  ["20260919235836_match_room_phase_three.sql", "ironclad_private", "finish_match_room_notification", "uuid,boolean", "dc86c684dca36c8314d3bd4373318d2e6fbc5d6ed26008554befd268fb1610e4"],
  ["20260919235836_match_room_phase_three.sql", "public", "get_match_room_assistance", "uuid", "c12c4fdb161b69700bdf3e09e3e678f258a16cdaae927d2c127b9d70131428bd", true],
  ["20260920014644_match_room_production_hardening.sql", "ironclad_private", "match_room_context", "uuid", "42782b7b13450d1ab358ee05761bb72f077400949a0cceddb5a5fcd0544f94a7"],
  ["20260920014644_match_room_production_hardening.sql", "ironclad_private", "match_room_writes_enabled", "", "f910a4b8bb98e330bd9fd308fc3e75650afbf06c24ef6bbe08ec6accbd79973d"],
  ["20260920014644_match_room_production_hardening.sql", "ironclad_private", "require_match_room_enabled", "", "0a28c49c9ab399d917f9854efc1ecd2d27f27eb4d3ab8caa565fb8cc6ff32f54"],
  ["20260923040754_match_room_disabled_assistance_gate.sql", "ironclad_private", "match_room_assistance_projection", "uuid", "e9e98c365346380583197385b4b61368d425a7fd30b672b7635dfb777b604ea7"],
  ["20260923040754_match_room_disabled_assistance_gate.sql", "public", "resolve_match_room_assistance", "uuid,bigint", "867592e16abea54852eeceb243e26c406bd10f88f2782c60b484767dcbfeb10e", true],
];
const legacyFunctions = await Promise.all(legacyFunctionSources.map(async ([file, schema, name, parameters, bodySha256, authenticated]) => {
  const qualified = `${schema}.${name}`;
  const source = (await readFile(resolve(ROOT, "supabase/migrations", file), "utf8")).replace(/\r\n/g, "\n");
  const start = source.search(new RegExp(`create(?: or replace)? function ${qualified.replace(".", "\\.")}\\(`, "i"));
  assert.ok(start >= 0, `Missing current legacy authority: ${qualified}`);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start, `Missing function body: ${qualified}`);
  return { signature: `${qualified}(${parameters})`, owner: "postgres", definition: source.slice(start, end + 3), bodySha256, authenticated };
}));
const actualFunctions = [...snapshot.functions, ...policySnapshot.functions, ...legacyFunctions];
assert.equal(snapshot.projectRef, "nsyjtqpvyxlzyujlbzos");
assert.equal(snapshot.functions.length, 164); assert.equal(cat.triggers.length, 137);
const qi = (s) => `"${String(s).replaceAll('"', '""')}"`;
const relation = (s) => s.includes(".") ? s.split(".").map(qi).join(".") : `public.${qi(s)}`;
const fullName = (s) => s.includes(".") ? s : `public.${s}`;
const frozenMigrations = await Promise.all(snapshot.frozenMigrations.map(async (m) => {
  const sql = (await readFile(resolve(ROOT, "supabase/migrations", m.file), "utf8")).replace(/\r\n/g, "\n");
  assert.equal(sha(sql), m.sha256, `Frozen migration changed: ${m.file}`); return { ...m, sql };
}));
const boundaryFile = "20261113000000_patch2_private_assistance_server_boundary.sql";
const boundarySql = (await readFile(resolve(ROOT, "supabase/migrations", boundaryFile), "utf8")).replace(/\r\n/g, "\n");
const boundaryHash = sha(boundarySql);
const report = { target: `${HOST}:${PORT} fresh disposable PostgreSQL17`, snapshotSha256: SNAPSHOT_SHA,
  policySupplementSha256: sha(policyRaw), fidelitySupplementSha256: sha(fidelityRaw),
  snapshotCapturedThrough: snapshot.capturedThrough,
  migrations: [...frozenMigrations.map(({ file, sha256 }) => ({ file, sha256 })), { file: boundaryFile, sha256: boundaryHash }], checks: [], warnings: [], limitations: [
    "Only catalog metadata is copied. All test records are fictional local historical snapshots; no Production/user records or secrets are read.",
    "All seven current closure functions and the real history predicate execute unchanged, with the captured actual constraints, foreign keys and triggers installed.",
    "Fixture preparation precedes trigger installation, with real constraints enforced; no guard/trigger is disabled during the closure tests.",
    "Actual auth.role/auth.jwt functions read simulated local claims. This is not a Clerk signature, browser session, Server Action or provider test.",
    "No Storage bytes are created/deleted. Media tests cover database ownership detachment and preserved cleanup work, not object-worker completion.",
    "The captured connected graph supports the focused cases; no claim of a full live-data backup/restore or every possible closure branch is made.",
  ] };
let database, postgres, failure, stage = "bootstrap", log = "";
const clients = new Set();
function command(name, args) {
  const r = spawnSync(resolve(BIN, `${name}.exe`), args, { cwd: WORKSPACE, env: childEnvironment,
    encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message ?? r.stderr ?? r.stdout}`);
}
async function connect(name = "production_closure_local") {
  const c = new Client({ host: HOST, port: PORT, user: "postgres", password, database: "postgres", ssl: false,
    application_name: name, connectionTimeoutMillis: 1000, statement_timeout: 30_000 });
  try { await c.connect(); } catch (e) { await c.end().catch(() => {}); throw e; }
  clients.add(c); c.on("notice", n => { if (n.severity === "WARNING") report.warnings.push(n.message); }); return c;
}
async function sql(s, p = []) { return (await database.query(s, p)).rows[0]?.value; }
async function owner() { await database.query("reset role"); }
async function claim(sub, admin = false, role = "authenticated") {
  await owner(); assert.ok(["authenticated", "service_role", "anon"].includes(role));
  await database.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claims',$2,false)",
    [role, JSON.stringify({ role, sub, metadata: { role: admin ? "admin" : "player" } })]);
  await database.query(`set role ${role}`);
}
async function rejected(op, code, pattern) { await assert.rejects(op, e => {
  assert.equal(e.code, code); if (pattern) assert.match(e.message, pattern); return true;
}); }
async function test(name, op) { stage = name; await op(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HISTORY = id(101), DELETE = id(102), ADMIN = id(103), PEER = id(104), T = id(201), ROOM = id(208);
const REQUESTS = new Map();
async function open(sub, body) {
  await claim(sub); return sql("select public.open_private_assistance($1,$2,$3) value", [ROOM, randomUUID(), body]);
}
async function read(request, sub = "local_closure_admin", admin = true) {
  await claim(sub, admin); return sql("select public.read_private_assistance($1,0,50,$2) value", [request, admin ? T : null]);
}
async function close(sub) { await claim("local_closure_admin", true, "service_role"); return sql("select public.close_ironclad_player_account($1) value", [sub]); }
function dispatch(operation, args, actor, isAdmin) {
  return sql("select public.call_patch2_private_assistance($1,$2,$3,$4) value",
    [operation, JSON.stringify(args), actor, isAdmin]);
}
function readArguments(requestId, tournamentId = null) {
  return { p_request_id: requestId, p_after_sequence: 0, p_limit: 50, p_tournament_id: tournamentId };
}
function replyArguments(requestId, body, tournamentId = null) {
  return { p_request_id: requestId, p_client_message_id: randomUUID(), p_body: body, p_tournament_id: tournamentId };
}
async function field(table, key, value, column) { return sql(`select ${qi(column)} value from ${relation(table)} where ${qi(key)}=$1`, [value]); }
async function protectedHistory() {
  await owner(); return sha(JSON.stringify(await sql(`select jsonb_build_object(
    'match',(select to_jsonb(m)-array['updated_at','official_result_decided_by','extended_by_clerk_user_id','held_by_clerk_user_id'] from public.tournament_matches m where id='${id(205)}'),
    'report',(select to_jsonb(r)-array['updated_at','submitted_by_clerk_user_id','reviewed_by','no_show_resolved_by'] from public.match_result_report_groups r where id='${id(209)}'),
    'replay',(select jsonb_agg(to_jsonb(s)-array['updated_at','submitted_by_clerk_user_id','reviewed_by'] order by id) from public.match_result_submissions s where report_group_id='${id(209)}'),
    'normalChat',(select jsonb_agg(to_jsonb(m)-'actor_clerk_user_id' order by id) from public.match_messages m),
    'room',(select to_jsonb(r) from public.match_rooms r where id='${ROOM}'),
    'roster',(select jsonb_agg(jsonb_build_object('id',id,'profile',profile_id,'tournament',tournament_id,'bracket',tournament_bracket_id,'status',registration_status) order by id) from public.registrations),
    'peer',(select to_jsonb(p) from public.players p where id='${PEER}')
  ) value`)));
}
async function restoreCatalog() {
  stage = "restore roles and schemas";
  const roles = new Set(["anon", "authenticated", "service_role", ...cat.relations.map(r => r.owner),
    ...actualFunctions.map(f => f.owner), ...cat.grants.map(g => g.grantee),
    ...snapshot.supplement.functionGrants.map(g => g.grantee), ...policySnapshot.grants.map(g => g.grantee),
    ...snapshot.supplement.schemaGrants.flatMap(g => [g.owner, g.grantee]),
    ...fidelity.defaultPrivileges.flatMap(g => [g.owner, g.grantee])]);
  for (const role of roles) if (role !== "PUBLIC" && role !== "postgres") {
    if (!await sql("select exists(select 1 from pg_roles where rolname=$1) value", [role])) {
      const attr = fidelity.roleAttributes.find(r => r.name === role);
      await database.query(`create role ${qi(role)} nologin${attr?.bypassRls ? " bypassrls" : ""}${attr?.inherit === false ? " noinherit" : ""}`);
    }
  }
  for (const schema of ["ironclad_private", "auth", "realtime", "extensions"]) await database.query(`create schema ${qi(schema)}`);
  await database.query("create extension pgcrypto with schema extensions");
  await database.query("set search_path=public,ironclad_private,extensions; set check_function_bodies=off");
  const ddl = [];
  stage = "restore captured table shapes";
  for (const r of cat.relations.filter(r => r.kind === "r" || r.kind === "p")) {
    const name = `${r.schema}.${r.name}`;
    const columns = cat.columns.filter(c => fullName(c.table) === name).map(c => {
      let text = `${qi(c.name)} ${c.type}`;
      if (c.generated) text += ` generated always as (${c.default}) stored`;
      if (c.notNull) text += " not null";
      return text;
    });
    assert.ok(columns.length, `No columns captured for ${name}`);
    const statement = `create table ${relation(name)} (${columns.join(",\n")})${r.kind === "p" ? ` partition by ${r.partitionKey}` : ""};`;
    await database.query(statement); ddl.push(statement);
  }
  for (const r of cat.relations.filter(r => r.kind === "v")) {
    const statement = `create view ${relation(`${r.schema}.${r.name}`)} as ${r.viewDefinition}`;
    await database.query(statement); ddl.push(statement);
  }
  for (const r of fidelity.reloptions ?? []) await database.query(`alter ${r.kind === "v" ? "view" : "table"} ${relation(r.table)} set (${r.options.join(",")})`);
  for (const r of snapshot.supplement.partitions ?? []) {
    const statement = `create table ${relation(r.table)} partition of ${relation(r.parent)} ${r.bound};`;
    await database.query(statement); ddl.push(statement);
    await database.query(`alter table ${relation(r.table)} owner to ${qi(r.owner)}`);
  }
  // Captured provider partitions age out by date. Give the disposable database
  // a real daily partition for today's test broadcasts when none covers today.
  const range = await sql(`select jsonb_build_object(
    'start', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD'),
    'end', to_char((clock_timestamp() at time zone 'UTC') + interval '1 day', 'YYYY-MM-DD')
  ) value`);
  assert.match(range.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(range.end, /^\d{4}-\d{2}-\d{2}$/);
  if (!(snapshot.supplement.partitions ?? []).some(r => r.parent === "realtime.messages" && r.bound.includes(`FROM ('${range.start} 00:00:00')`))) {
    await database.query(`create table realtime.local_test_current_day partition of realtime.messages for values from ('${range.start}') to ('${range.end}')`);
  }
  stage = "restore actual function bodies";
  for (const f of actualFunctions) {
    assert.ok(!/\b(?:net\.|vault\.|pg_read_file|lo_import)\b/.test(f.definition), `Unexpected external dependency ${f.signature}`);
    await database.query(f.definition); ddl.push(f.definition);
    await database.query(`alter function ${f.signature} owner to ${qi(f.owner)}`);
    const actual = await sql("select encode(sha256(convert_to(prosrc,'UTF8')),'hex') value from pg_proc where oid=$1::regprocedure", [f.signature]);
    assert.equal(actual, f.bodySha256, `Actual Production body changed: ${f.signature}`);
  }
  stage = "restore defaults and constraints";
  for (const c of cat.columns.filter(c => c.default && !c.generated && !cat.relations.some(r => r.kind === "v" && `${r.schema}.${r.name}` === fullName(c.table))))
    await database.query(`alter table ${relation(c.table)} alter column ${qi(c.name)} set default ${c.default}`);
  // pg_constraint kind=t describes a constraint trigger. Its actual CREATE
  // CONSTRAINT TRIGGER is restored with the trigger catalog, not as table DDL.
  for (const c of cat.constraints.filter(c => c.kind !== "f" && c.kind !== "t")) await database.query(`alter table ${relation(c.table)} add constraint ${qi(c.name)} ${c.definition}`);
  for (const i of cat.indexes.filter(i => !i.constraintBacked)) await database.query(i.definition);
  for (const c of cat.constraints.filter(c => c.kind === "f")) await database.query(`alter table ${relation(c.table)} add constraint ${qi(c.name)} ${c.definition}`);
  stage = "restore real RLS and ACL";
  for (const r of cat.relations) {
    const name = relation(`${r.schema}.${r.name}`);
    await database.query(`alter ${r.kind === "v" ? "view" : "table"} ${name} owner to ${qi(r.owner)}`);
    await database.query(`revoke all on ${name} from public,anon,authenticated,service_role`);
    if (r.rls) await database.query(`alter table ${name} enable row level security`);
    if (r.forceRls) await database.query(`alter table ${name} force row level security`);
  }
  for (const p of cat.policies ?? []) await database.query(`create policy ${qi(p.name)} on ${relation(`${p.schema}.${p.table}`)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(r => r === "public" ? "public" : qi(r)).join(",")}${p.using ? ` using (${p.using})` : ""}${p.check ? ` with check (${p.check})` : ""}`);
  for (const g of cat.grants) await database.query(`grant ${g.privilege} on ${relation(g.table)} to ${g.grantee === "PUBLIC" ? "public" : qi(g.grantee)}${g.grantable ? " with grant option" : ""}`);
  for (const f of actualFunctions) await database.query(`revoke all on function ${f.signature} from public,anon,authenticated,service_role`);
  for (const g of [...snapshot.supplement.functionGrants, ...policySnapshot.grants]) await database.query(`grant ${g.privilege} on function ${g.signature} to ${g.grantee === "PUBLIC" ? "public" : qi(g.grantee)}${g.grantable ? " with grant option" : ""}`);
  for (const f of legacyFunctions.filter(f => f.authenticated)) {
    await database.query(`grant execute on function ${f.signature} to authenticated`);
  }
  for (const g of snapshot.supplement.schemaGrants) await database.query(`alter schema ${qi(g.schema)} owner to ${qi(g.owner)}`);
  for (const g of snapshot.supplement.schemaGrants) await database.query(`grant ${g.privilege} on schema ${qi(g.schema)} to ${g.grantee === "PUBLIC" ? "public" : qi(g.grantee)}${g.grantable ? " with grant option" : ""}`);
  const defaultKinds = { r: "tables", f: "functions", S: "sequences" };
  const groups = new Map(fidelity.defaultPrivileges.map(g => [`${g.owner}:${g.schema}:${g.type}`, g]));
  for (const g of groups.values()) await database.query(`alter default privileges for role ${qi(g.owner)} in schema ${qi(g.schema)} revoke all on ${defaultKinds[g.type]} from public,anon,authenticated,service_role`);
  for (const g of fidelity.defaultPrivileges) await database.query(`alter default privileges for role ${qi(g.owner)} in schema ${qi(g.schema)} grant ${g.privilege} on ${defaultKinds[g.type]} to ${g.grantee === "PUBLIC" ? "public" : qi(g.grantee)}${g.grantable ? " with grant option" : ""}`);
  await database.query("set check_function_bodies=on");
  await writeFile(resolve(RUN, "restored-function-and-table-source.sql"), ddl.join("\n"));
  report.restored = { relations: cat.relations.length, constraints: cat.constraints.length, functions: actualFunctions.length,
    triggers: cat.triggers.length, partitions: snapshot.supplement.partitions.length };
}
try {
  await new Promise((accept, reject) => { const server = net.createServer(); server.once("error", reject);
    server.listen({ host: HOST, port: PORT, exclusive: true }, () => server.close(accept)); });
  await mkdir(RUN); await writeFile(passwordFile, `${password}\n`, { flag: "wx", mode: 0o600 });
  command("initdb", ["-D", DATA, "-U", "postgres", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  await unlink(passwordFile);
  postgres = spawn(resolve(BIN, "postgres.exe"), ["-D", DATA, "-h", HOST, "-p", String(PORT), "-c", "unix_socket_directories=", "-c", "max_connections=12", "-c", "shared_buffers=32MB"],
    { cwd: WORKSPACE, env: childEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  postgres.stdout.on("data", c => { log += c; }); postgres.stderr.on("data", c => { log += c; });
  for (let i = 0; i < 100; i++) { if (postgres.exitCode !== null) throw Error("Disposable PostgreSQL exited before readiness");
    try { database = await connect(); break; } catch { await delay(100); } }
  assert.ok(database, "Disposable database did not become ready");
  const identity = (await database.query("select host(inet_server_addr()) host,inet_server_port() port,current_user,current_setting('listen_addresses') listen,current_setting('data_directory') directory,version() version")).rows[0];
  assert.equal(identity.host, HOST); assert.equal(identity.port, PORT); assert.equal(identity.listen, HOST);
  assert.equal(resolve(identity.directory), DATA); assert.equal(identity.current_user, "postgres"); assert.match(identity.version, /PostgreSQL 17\./);
  report.databaseIdentity = identity;
  await restoreCatalog();
  stage = "seed explicitly fictional historical snapshot";
  await database.query(await readFile(resolve(ROOT, "tests/patch2-db/production-closure-schema.sql"), "utf8"));
  stage = "install every captured enabled trigger";
  for (const t of cat.triggers) { await database.query(t.definition);
    if (t.enabled === "D") await database.query(`alter table ${relation(t.table)} disable trigger ${qi(t.name)}`);
    else if (t.enabled === "A") await database.query(`alter table ${relation(t.table)} enable always trigger ${qi(t.name)}`);
    else if (t.enabled === "R") await database.query(`alter table ${relation(t.table)} enable replica trigger ${qi(t.name)}`);
  }
  const beforeChain = snapshot.functions.filter(f => f.name.startsWith("close_ironclad_player_account"));
  stage = "apply exact four frozen migrations in order";
  for (const m of frozenMigrations) await database.query(m.sql);
  await test("four exact migrations preserve the entire current Production closure chain", async () => {
    for (const f of beforeChain) {
      const signature = f.name === "close_ironclad_player_account" ? "public.close_ironclad_player_account_without_private_assistance(text)" : f.signature;
      assert.equal(await sql("select encode(sha256(convert_to(prosrc,'UTF8')),'hex') value from pg_proc where oid=$1::regprocedure", [signature]), f.bodySha256);
    }
    report.currentProductionClosureHash = beforeChain.find(f => f.name === "close_ironclad_player_account").bodySha256;
    assert.equal(await sql("select count(*)::int value from pg_trigger where not tgisinternal"), cat.triggers.length + 4);
    assert.equal(await sql("select bool_and(tgenabled<>'D') value from pg_trigger where not tgisinternal"), true);
    assert.equal(await sql("select 'security_barrier=true'=any(reloptions) value from pg_class where oid='ironclad_private.leaderboard_official_season_standings'::regclass"), true);
    assert.equal(await sql("select has_table_privilege('service_role','public.assistance_requests','DELETE') value"), true);
    assert.equal(await sql("select has_table_privilege('service_role','public.assistance_messages','SELECT') value"), false);
  });
  await test("actual history predicate distinguishes historical and unreferenced subjects", async () => {
    assert.equal(await sql("select public.player_has_authoritative_competition_history($1) value", [HISTORY]), true);
    assert.equal(await sql("select public.player_has_authoritative_competition_history($1) value", [DELETE]), false);
  });
  await test("actual assistance writers create private retained history with no external delivery eligibility", async () => {
    await owner(); await database.query("update public.platform_settings set value='{\"enabled\":true}' where key='private_assistance_new_requests_enabled'");
    const one = await open("local_closure_history", "LOCAL synthetic private history question"); REQUESTS.set("history", one.request.id);
    const other = await open("local_closure_peer", "LOCAL unrelated private conversation"); REQUESTS.set("peer", other.request.id);
    await claim("local_closure_admin", true); await sql("select public.reply_private_assistance($1,$2,$3,$4) value", [one.request.id, randomUUID(), "LOCAL administrator reply", T]);
    await owner(); assert.equal(await sql("select count(*)::int value from public.notifications where type like 'assistance.%' and(push_delivery_status is not null or email_delivery_status is not null)"), 0);
    assert.equal(await sql("select count(*)::int value from ironclad_private.match_room_retention_cases where case_reference=any($1::uuid[]) and closed_at is null", [[one.request.id, other.request.id]]), 2);
  });
  let historyDigest, peerConversation;
  await test("normal entrypoint pseudonymizes a historical player and scrubs private Clerk provenance", async () => {
    peerConversation = await read(REQUESTS.get("peer")); historyDigest = await protectedHistory();
    const result = await close("local_closure_history"); assert.equal(result.outcome, "pseudonymized");
    await owner(); const p = (await database.query("select * from public.players where id=$1", [HISTORY])).rows[0];
    assert.ok(p.account_closed_at); assert.match(p.clerk_user_id, /^deleted:/); assert.equal(p.display_name, "Former Competitor");
    assert.equal(p.steam_id64, null); assert.equal(p.coh3_profile_id, null);
    assert.equal(await sql("select count(*)::int value from public.assistance_messages where actor_clerk_user_id='local_closure_history'"), 0);
    const data = await read(REQUESTS.get("history")); assert.equal(data.request.status, "in_progress");
    assert.equal(data.messages[0].body, "LOCAL synthetic private history question"); assert.equal(data.messages[1].body, "LOCAL administrator reply");
    assert.equal(await protectedHistory(), historyDigest);
    const peerAfter = await read(REQUESTS.get("peer")); assert.deepEqual(peerAfter, peerConversation);
  });
  await test("real media FK and immutable-upload trigger preserve cleanup while detaching ownership", async () => {
    await owner(); assert.equal(await sql("select count(*)::int value from public.player_combat_highlight_slots where player_id=$1", [HISTORY]), 0);
    const upload = (await database.query("select * from ironclad_private.player_combat_highlight_uploads where id=$1", [id(220)])).rows[0];
    assert.equal(upload.player_id, null); assert.equal(upload.slot_number, null); assert.equal(upload.state, "delete_pending");
    assert.equal(upload.title, null); assert.equal(upload.file_name, null); assert.ok(upload.cleanup_after);
    assert.equal(upload.cleanup_attempts, 2); assert.equal(upload.request_id, id(221));
    assert.equal(await field("ironclad_private.player_combat_highlight_reports", "id", id(222), "reporter_player_id"), null);
    assert.equal(await sql("select count(*)::int value from public.player_showcases where player_id=$1", [HISTORY]), 0);
    assert.equal(await field("public.player_showcases", "player_id", PEER, "thought_moderated_by_clerk_user_id"), null);
  });
  await test("existing announcement, push, polling and legacy room privacy cleanup still executes", async () => {
    await owner(); assert.equal(await sql("select count(*)::int value from public.push_subscriptions where owner_clerk_user_id='local_closure_history'"), 0);
    assert.equal(await sql("select count(*)::int value from public.announcement_read_states where clerk_user_id='local_closure_history'"), 0);
    assert.equal(await field("public.announcements", "id", id(230), "published_by_clerk_user_id"), null);
    assert.equal(await field("public.polls", "id", id(240), "draft_audience_invalidated"), true);
    assert.equal(await sql("select count(*)::int value from public.poll_eligible_voters where poll_id=$1", [id(240)]), 0);
    assert.equal(await field("public.poll_eligible_voters", "id", id(243), "player_id"), null);
    assert.equal(await sql("select count(*)::int value from public.match_room_reads where viewer_clerk_user_id='local_closure_history'"), 0);
    assert.equal(await field("public.match_room_assistance", "room_id", ROOM, "resolved_by_clerk_user_id"), null);
    assert.equal(await field("public.match_messages", "id", id(211), "actor_clerk_user_id"), null);
  });
  await test("closure retries are safe and a deleted nonhistorical player cannot retain admin access", async () => {
    assert.equal((await close("local_closure_history")).outcome, "not_found");
    assert.equal((await close("local_closure_delete")).outcome, "deleted");
    assert.equal((await close("local_closure_delete")).outcome, "not_found");
    await owner(); assert.equal(await sql("select count(*)::int value from public.players where id=$1", [DELETE]), 0);
    for (const sub of ["local_closure_delete", "local_closure_history", "local_closure_missing"]) {
      await claim(sub, true); await rejected(sql("select public.list_admin_private_assistance($1,'all',1,null) value", [T]), "42501");
      await rejected(sql("select public.read_private_assistance($1,0,50,$2) value", [REQUESTS.get("history"), T]), "42501");
      await rejected(sql("select public.reply_private_assistance($1,$2,'stale JWT',$3) value", [REQUESTS.get("history"), randomUUID(), T]), "42501");
    }
  });
  await test("closure remains trusted-only and missing/wrong tournament cannot alter retained assistance", async () => {
    await claim("local_closure_admin", true); await rejected(sql("select public.close_ironclad_player_account('local_closure_peer') value"), "42501");
    await rejected(sql("select public.read_private_assistance($1,0,50,null) value", [REQUESTS.get("history")]), "42501");
    await rejected(sql("select public.set_private_assistance_status($1,$2,'resolved',1) value", [id(999), REQUESTS.get("history")]), "42501");
    await rejected(sql("select public.request_match_room_assistance($1,0) value", [ROOM]), "55000", /MESSAGE_REQUIRED/);
    await rejected(database.query("select * from public.assistance_messages"), "42501");
    await owner(); assert.equal(await protectedHistory(), historyDigest);
  });
  await test("active support prevents redaction/purge and account closure does not resolve it", async () => {
    await claim("local_closure_admin", true, "service_role");
    const subjectMessage = await sql("select id value from public.assistance_messages where request_id=$1 and sender_kind='requester'", [REQUESTS.get("history")]).catch(() => null);
    await owner(); const message = subjectMessage ?? await sql("select id value from public.assistance_messages where request_id=$1 and sender_kind='requester'", [REQUESTS.get("history")]);
    await claim("local_closure_admin", true, "service_role");
    await rejected(sql("select public.redact_private_assistance_messages($1,$2,$3,'local_closure_admin') value", [HISTORY, REQUESTS.get("history"), [message]]), "55000", /Retained case/);
    const result = await sql("select public.purge_match_room_retention($1,'local_closure_admin') value", [[ROOM]]); assert.equal(result.privateAssistanceMessagesDeleted, 0);
    const retained = await read(REQUESTS.get("history")); assert.equal(retained.request.contentPurgedAt, null); assert.equal(retained.request.status, "in_progress");
    assert.equal(retained.messages[0].body, "LOCAL synthetic private history question");
  });
  await test("normal closure deletes a nonhistorical admin author while retaining reply UUID/history", async () => {
    await owner(); assert.equal(await sql("select public.player_has_authoritative_competition_history($1) value", [ADMIN]), false);
    const original = (await read(REQUESTS.get("history"))).messages;
    assert.equal((await close("local_closure_admin")).outcome, "deleted");
    await owner(); assert.equal(await sql("select count(*)::int value from public.players where id=$1", [ADMIN]), 0);
    assert.equal(await sql("select count(*)::int value from public.assistance_messages where author_player_id=$1 and actor_clerk_user_id is null and body='LOCAL administrator reply'", [ADMIN]), 1);
    assert.deepEqual((await read(REQUESTS.get("history"), "local_closure_admin2", true)).messages, original);
    await claim("local_closure_admin", true);
    await rejected(sql("select public.read_private_assistance($1,0,50,$2) value", [REQUESTS.get("history"), T]), "42501");
    await rejected(sql("select public.list_admin_private_assistance($1,'all',1,null) value", [T]), "42501");
  });

  stage = "apply assistance server boundary after the four frozen migrations";
  await owner();
  await database.query(boundarySql);

  const activeAdmin = "local_closure_admin2", requester = "local_closure_peer";
  const historyRequest = REQUESTS.get("history"), requesterRequest = REQUESTS.get("peer");
  const queueArgs = { p_tournament_id: T, p_status: "all", p_page: 1, p_selected_id: null };
  const legacyQueueArgs = { p_tournament_id: T, p_page: 1, p_include_resolved: true };
  const dispatcherSignature = "public.call_patch2_private_assistance(text,jsonb,text,boolean)";
  const originalEntrypoints = [
    "public.get_private_assistance_context(uuid)", "public.open_private_assistance(uuid,uuid,text)",
    "public.read_private_assistance(uuid,bigint,integer,uuid)", "public.reply_private_assistance(uuid,uuid,text,uuid)",
    "public.list_admin_private_assistance(uuid,text,integer,uuid)", "public.set_private_assistance_status(uuid,uuid,text,bigint)",
    "public.list_legacy_room_assistance(uuid,integer,boolean)", "public.get_match_room_assistance(uuid)",
    "public.resolve_match_room_assistance(uuid,bigint)",
  ];

  await test("direct browser RPCs are closed and the dispatcher is service-role only", async () => {
    await owner();
    const grants = await sql(`select jsonb_build_object(
      'direct', not exists (
        select 1 from unnest($1::text[]) signature cross join unnest($2::text[]) role_name
        where has_function_privilege(role_name, signature, 'EXECUTE')
      ),
      'dispatch', has_function_privilege('service_role', $3, 'EXECUTE')
        and not has_function_privilege('authenticated', $3, 'EXECUTE')
        and not has_function_privilege('anon', $3, 'EXECUTE')
    ) value`, [originalEntrypoints, ["anon", "authenticated", "service_role"], dispatcherSignature]);
    assert.deepEqual(grants, { direct: true, dispatch: true });
    await claim(activeAdmin, true);
    await rejected(read(historyRequest, activeAdmin), "42501", /permission denied/i);
    await rejected(sql("select public.get_match_room_assistance($1) value", [ROOM]), "42501", /permission denied/i);
    await rejected(sql("select public.resolve_match_room_assistance($1,1) value", [ROOM]), "42501", /permission denied/i);
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest, T), activeAdmin, true), "42501", /permission denied/i);
    await claim("local_unauthenticated", false, "anon");
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest, T), activeAdmin, true), "42501", /permission denied/i);
    await owner();
    await database.query("select set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims','',false)");
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest, T), activeAdmin, true), "42501", /Trusted assistance server/);
  });

  await test("the dispatcher preserves requester ownership and checks current staff authority", async () => {
    await claim("local_trusted_dispatcher", false, "service_role");
    const own = await dispatch("read_private_assistance", readArguments(requesterRequest), requester, false);
    assert.equal(own.request.id, requesterRequest);
    assert.equal(own.messages[0].body, "LOCAL unrelated private conversation");
    const staff = await dispatch("read_private_assistance", readArguments(historyRequest, T), activeAdmin, true);
    assert.equal(staff.request.id, historyRequest);
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest), requester, false), "42501");
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest, T), activeAdmin, false), "42501");
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest, id(999)), activeAdmin, true), "42501");
    await rejected(dispatch("read_private_assistance", readArguments(historyRequest), activeAdmin, true), "42501");
    for (const closed of ["local_closure_admin", "local_closure_history", "local_closure_delete"]) {
      await rejected(dispatch("read_private_assistance", readArguments(historyRequest, T), closed, true), "42501");
      await rejected(dispatch("list_admin_private_assistance", queueArgs, closed, true), "42501");
    }
    await rejected(dispatch("list_admin_private_assistance", queueArgs, activeAdmin, false), "42501");
    assert.equal((await dispatch("list_admin_private_assistance", queueArgs, activeAdmin, true)).counts.all, 2);
    const context = await dispatch("get_private_assistance_context", { p_room_id: ROOM }, requester, false);
    assert.equal(context.request.id, requesterRequest);
    const existing = await dispatch("open_private_assistance", {
      p_room_id: ROOM, p_client_message_id: randomUUID(), p_body: "LOCAL duplicate draft",
    }, requester, false);
    assert.equal(existing.request.id, requesterRequest);
    assert.equal(existing.accepted, false);
  });

  await test("only documented operations and exact argument keys are accepted", async () => {
    await claim("local_trusted_dispatcher", false, "service_role");
    const readArgs = readArguments(requesterRequest);
    const { p_tournament_id, ...missing } = readArgs;
    assert.equal(p_tournament_id, null);
    for (const [operation, args, actor, isAdmin] of [
      ["close_ironclad_player_account", {}, requester, false],
      ["read_private_assistance", missing, requester, false],
      ["read_private_assistance", { ...readArgs, p_actor: activeAdmin }, requester, false],
      ["read_private_assistance", [], requester, false],
      ["read_private_assistance", readArgs, " ", false],
      ["read_private_assistance", readArgs, requester, null],
    ]) {
      await rejected(dispatch(operation, args, actor, isAdmin), "22023");
    }
  });

  await test("trusted caller JWT settings are restored after success and failed calls", async () => {
    await claim("local_trusted_dispatcher", false, "service_role");
    await database.query("begin");
    try {
      await database.query(`select set_config('request.jwt.claim', $1, true),
        set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', 'local_service_sub', true)`,
      [
        JSON.stringify({ role: "service_role", sub: "local_singular_service", metadata: { role: "admin" } }),
        JSON.stringify({ role: "service_role", sub: "local_plural_service", metadata: { role: "player" } }),
      ]);
      const snapshot = () => sql(`select jsonb_build_array(current_setting('request.jwt.claim',true),
        current_setting('request.jwt.claims',true),current_setting('request.jwt.claim.role',true),
        current_setting('request.jwt.claim.sub',true),auth.jwt(),auth.role()) value`);
      const before = await snapshot();
      const own = await dispatch("read_private_assistance", readArguments(requesterRequest), requester, false);
      assert.equal(own.request.id, requesterRequest);
      assert.deepEqual(await snapshot(), before);
      await database.query("savepoint expected_denial");
      await rejected(dispatch("read_private_assistance", readArguments(historyRequest), requester, false), "42501");
      await database.query("rollback to savepoint expected_denial");
      assert.deepEqual(await snapshot(), before);
    } finally {
      await database.query("rollback");
    }
  });

  await test("private status and replies still persist with the server boundary", async () => {
    await claim("local_trusted_dispatcher", false, "service_role");
    const statusArgs = { p_tournament_id: T, p_request_id: requesterRequest, p_status: "resolved", p_expected_version: 1 };
    await rejected(dispatch("set_private_assistance_status", statusArgs, activeAdmin, false), "42501");
    const resolved = await dispatch("set_private_assistance_status", statusArgs, activeAdmin, true);
    assert.equal(resolved.request.status, "resolved");
    const reopened = await dispatch("reply_private_assistance", replyArguments(requesterRequest, "LOCAL reopen through dispatcher"), requester, false);
    assert.equal(reopened.request.status, "open");
    assert.equal(reopened.request.resolvedAt, null);
    const reply = await dispatch("reply_private_assistance", replyArguments(requesterRequest, "LOCAL verified staff reply", T), activeAdmin, true);
    assert.equal(reply.request.status, "in_progress");
    const persisted = await dispatch("read_private_assistance", readArguments(requesterRequest), requester, false);
    assert.equal(persisted.messages.at(-1).body, "LOCAL verified staff reply");
    await owner();
    assert.equal(await protectedHistory(), historyDigest);
    assert.equal(await sql("select count(*)::int value from public.notifications where type like 'assistance.%' and (push_delivery_status is not null or email_delivery_status is not null)"), 0);
  });

  await test("retained shared-room assistance still reads and resolves through authorized callers", async () => {
    await owner();
    await database.query("insert into public.platform_settings(key,value) values('match_room','{\"enabled\":true}') on conflict(key) do update set value=excluded.value");
    await database.query("update public.match_room_assistance set status='requested',request_version=2,resolved_at=null where room_id=$1", [ROOM]);
    await claim("local_trusted_dispatcher", false, "service_role");
    const roomArgs = { p_room_id: ROOM };
    const resolveArgs = { ...roomArgs, p_expected_request_version: 2 };
    const playerView = await dispatch("get_match_room_assistance", roomArgs, requester, false);
    assert.equal(playerView.status, "requested");
    assert.equal(playerView.canResolve, false);
    assert.equal((await dispatch("list_legacy_room_assistance", legacyQueueArgs, activeAdmin, true)).totalCount, 1);
    await rejected(dispatch("resolve_match_room_assistance", resolveArgs, requester, false), "42501");
    await rejected(dispatch("get_match_room_assistance", roomArgs, "local_closure_history", true), "42501");
    assert.equal((await dispatch("get_match_room_assistance", roomArgs, activeAdmin, true)).canResolve, true);
    const retained = await dispatch("resolve_match_room_assistance", resolveArgs, activeAdmin, true);
    assert.equal(retained.status, "resolved");
    assert.equal(retained.requestVersion, 2);
    assert.equal((await dispatch("get_match_room_assistance", roomArgs, requester, false)).status, "resolved");
    assert.equal(await protectedHistory(), historyDigest);
    assert.equal(await sql("select count(*)::int value from realtime.messages where event='invalidate' and payload->>'roomId'=$1", [ROOM]), 2);
  });

  await test("normal closure still preserves the conversation behind the new server boundary", async () => {
    assert.equal((await close(requester)).outcome, "pseudonymized");
    await rejected(dispatch("read_private_assistance", readArguments(requesterRequest), requester, false), "42501");
    const retained = await dispatch("read_private_assistance", readArguments(requesterRequest, T), activeAdmin, true);
    assert.equal(retained.request.status, "in_progress");
    assert.equal(retained.messages.at(-1).body, "LOCAL verified staff reply");
    await owner();
    assert.equal(await sql("select count(*)::int value from public.assistance_messages where actor_clerk_user_id=$1", [requester]), 0);
  });

  for (const m of frozenMigrations) assert.equal(sha((await readFile(resolve(ROOT, "supabase/migrations", m.file), "utf8")).replace(/\r\n/g, "\n")), m.sha256);
  assert.equal(sha((await readFile(resolve(ROOT, "supabase/migrations", boundaryFile), "utf8")).replace(/\r\n/g, "\n")), boundaryHash);
  assert.ok(!report.warnings.some(w => /WarnSendingBroadcastMessage/.test(w)), "Actual Realtime send swallowed an error");
  report.passed = true;
} catch (e) { failure = e; report.passed = false; report.failure = e.message; report.errorCode = e.code; report.errorContext = e.where; report.errorPosition = e.position; report.stage = stage; }
finally {
  for (const c of clients) await c.end().catch(() => {});
  if (postgres && postgres.exitCode === null) { try { command("pg_ctl", ["-D", DATA, "-m", "fast", "-w", "-t", "15", "stop"]); } catch (e) { report.stopFailure = e.message; report.passed = false; } }
  if (postgres?.exitCode === null) await Promise.race([new Promise(accept => postgres.once("exit", accept)), delay(3000)]);
  report.stopped = !postgres || postgres.exitCode !== null; if (!report.stopped) report.passed = false;
  await writeFile(resolve(RUN, "postgres.log"), log).catch(() => {}); await writeFile(resolve(RUN, "report.json"), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
  await unlink(passwordFile).catch(() => {});
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, stopped: report.stopped, stage: report.stage, errorCode: report.errorCode,
    failure: report.failure, context: report.errorContext, report: resolve(RUN, "report.json") }, null, 2));
}
if (failure) console.error(failure.message);
if (!report.passed) process.exitCode = 1;
