// LOCAL ONLY. Requires the empty full replay used by the companion SQL suite.
// node tests/database/member-rpc-current-account-acceptance-concurrency.mjs <psql.exe>
// Creates/drops only its exact disposable database and synthetic login role.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const psql = process.argv[2];
assert(psql, "Pass the local psql executable path");
const database = "ironclad_member_rpc_race_tests";
const sourceDatabase = "ironclad_member_rpc_tests";
const role = "ironclad_member_rpc_race_client";
const processes = new Set();
let created = false;
let assertions = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function start(sql, app = "member-rpc-race-control", db = database, interactive = false) {
  const child = spawn(psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=verbose", "-h", "127.0.0.1", "-p", "56584",
    "-U", "postgres", "-d", db], {
    windowsHide: true,
    env: { ...process.env, PGAPPNAME: app, PGCONNECT_TIMEOUT: "5" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  processes.add(child);
  const result = { child, stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => { result.stdout += chunk; });
  child.stderr.on("data", (chunk) => { result.stderr += chunk; });
  result.done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${app}`)); }, 15000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      processes.delete(child);
      resolve({ code, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
    });
  });
  child.stdin.write("set statement_timeout='12s'; set lock_timeout='10s';\n" + sql + "\n");
  if (!interactive) child.stdin.end();
  return result;
}
async function run(sql, db = database) {
  const result = await start(sql, "member-rpc-race-control", db).done;
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}
function member(sql, n = 1) {
  return `set session authorization ${role}; set role authenticated;
    set request.jwt.claim.role='authenticated';
    set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-${n}"}';
    ${sql}`;
}
async function waitUntil(predicate, label) {
  const deadline = Date.now() + 5000;
  while (!(await predicate())) {
    assert(Date.now() < deadline, `Did not observe ${label}`);
    await delay(30);
  }
}
async function holder(sql) {
  const request = start(`begin; ${sql};\n\\echo LOCK_READY`, "member-rpc-race-holder", database, true);
  await waitUntil(() => request.stdout.includes("LOCK_READY"), "holder lock");
  return request;
}
async function release(request) {
  request.child.stdin.end("commit;\n");
  const result = await request.done;
  assert.equal(result.code, 0, result.stderr);
}
async function waitLocked(app) {
  await waitUntil(async () => (await run(`select exists(select 1 from pg_stat_activity
    where datname=current_database() and application_name='${app}' and wait_event_type='Lock');`)) === "t",
  `${app} waiting on a real PostgreSQL lock`);
}
function passed(name) { assertions++; console.log(`PASS ${name}`); }
async function race(lock, sqlA, sqlB, verify, label) {
  const gate = await holder(lock);
  const first = start(sqlA, "member-rpc-race-first");
  const second = start(sqlB, "member-rpc-race-second");
  await Promise.all([waitLocked("member-rpc-race-first"), waitLocked("member-rpc-race-second")]);
  await release(gate);
  const results = await Promise.all([first.done, second.done]);
  await verify(results);
  passed(label);
}
const poll = "a1500000-0000-4000-8000-000000000001";
const match = "a1700000-0000-4000-8000-000000000001";
const bracket = "a1300000-0000-4000-8000-000000000002";
const offer = "a1400000-0000-4000-8000-000000000003";
const option = (n) => `a1600000-0000-4000-8000-00000000000${n}`;
const ballot = (revision, n) => `select public.cast_poll_ballot('${poll}',${revision},array['${option(n)}'::uuid]);`;
const dice = (game = 1) => `select public.roll_match_dice('${match}',1,${game}::smallint,1);`;
const accept = `select * from public.respond_to_waitlist_offer('${offer}','accept');`;
const success = (result) => assert.equal(result.code, 0, result.stderr);

try {
  assert.equal(await run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56584;", "postgres"), "t");
  assert.equal(await run(`select not exists(select 1 from pg_database where datname='${database}')
    and not exists(select 1 from pg_roles where rolname='${role}');`, "postgres"), "t");
  assert.equal(await run("select (select count(*) from public.players)=0 and (select count(*) from public.legal_documents)=0;", sourceDatabase), "t");
  await run(`create database ${database} template ${sourceDatabase};`, "postgres");
  created = true;
  const fixture = readFileSync(new URL("./member-rpc-current-account-acceptance-local.sql", import.meta.url), "utf8")
    .split("set session authorization ironclad_member_rpc_test_client;")[0]
    .replaceAll(sourceDatabase, database)
    .replaceAll("ironclad_member_rpc_test_client", role);
  await run(fixture + "\ncommit;");
  const tables = (await run(`select format('%I.%I', namespace.nspname, relation.relname)
    from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relkind in('r','p') order by relation.relname;`)).split("\n");
  const fingerprints = tables.map((table) => `select '${table}' as name,
    md5(coalesce(string_agg(row_to_json(row)::text,E'\\n' order by row_to_json(row)::text),'')) as fingerprint
    from ${table} as row`).join("\nunion all\n");
  const beforeRepeat = await run(fingerprints);
  await run(readFileSync(new URL("../../supabase/migrations/20260908052210_member_rpc_current_account_acceptance.sql", import.meta.url), "utf8"));
  assert.equal(await run(fingerprints), beforeRepeat);
  passed("reapplying the migration preserves every public-table synthetic data fingerprint");
  assert.equal(await run(member(`select current_user='authenticated' and session_user='${role}';`)), "t");
  passed("actual non-owner authenticated session");

  const pollLock = `select 1 from public.poll_eligible_voters where poll_id='${poll}' for update`;
  await race(pollLock, member(ballot(0, 1)), member(ballot(0, 2)), async (results) => {
    assert.equal(results.filter((r) => r.code === 0).length, 1);
    assert.match(results.find((r) => r.code !== 0).stderr, /40001.*Ballot revision conflict/);
    assert.equal(await run(`select count(*)=1 and max(ballot_revision)=1 from public.poll_eligible_voters where poll_id='${poll}' and ballot_revision>0;`), "t");
  }, "concurrent different ballots retain one revision and reject stale write");
  const chosen = await run(`select option_id from public.poll_ballot_choices where poll_id='${poll}';`);
  const retry = `select public.cast_poll_ballot('${poll}',0,array['${chosen}'::uuid]);`;
  await race(pollLock, member(retry), member(retry), async (results) => {
    results.forEach(success);
    results.forEach((r) => assert.equal(JSON.parse(r.stdout).idempotent, true));
    assert.equal(await run(`select count(*) from public.poll_ballot_choices where poll_id='${poll}';`), "1");
  }, "concurrent identical ballot retries preserve one choice");

  await race(`select 1 from public.tournament_matches where id='${match}' for update`, member(dice()), member(dice()), async (results) => {
    results.forEach(success);
    const rolls = results.map((r) => JSON.parse(r.stdout).roll);
    assert.equal(rolls.filter((r) => r.created).length, 1);
    const withoutCreated = (roll) => {
      const copy = { ...roll };
      delete copy.created;
      return copy;
    };
    assert.deepEqual(withoutCreated(rolls[0]), withoutCreated(rolls[1]));
    assert.equal(await run("select count(*) from public.match_dice_rolls;"), "1");
  }, "concurrent dice retries preserve one immutable server roll");

  // Scope lifecycle setup to disposable rows. Domain triggers run for each RPC.
  await run(`begin; alter table public.registrations disable trigger user;
    update public.registrations set waitlist_offer_status=null,waitlist_offer_created_at=null,
      waitlist_offer_expires_at=null,created_at=now()+interval '1 second'*(right(id::text,1)::integer)
      where tournament_bracket_id='${bracket}' and registration_status='waitlisted';
    alter table public.players disable trigger user;
    insert into public.players(id,clerk_user_id,display_name,in_game_name,profile_completed,current_elo)
      select ('a1100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'member-rpc-test-'||n,
      'Race synthetic '||n,'Race synthetic '||n,true,1000 from generate_series(8,13)n;
    insert into public.registrations(id,profile_id,clerk_user_id,player_name,tournament_title,bracket_name,
      registration_status,elo_status,submitted_elo,tournament_id,tournament_bracket_id)
      select ('a1400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      ('a1100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'member-rpc-test-'||n,
      'Synthetic','Member RPC','Academy Bracket','pending','pending',1000,
      'a1200000-0000-4000-8000-000000000002','${bracket}' from generate_series(8,13)n;
    alter table public.registrations enable trigger user;
    alter table public.players enable trigger user; commit;`);
  const reconcile = `select public.reconcile_tournament_waitlist('${bracket}');`;
  const bracketLock = `select 1 from public.tournament_brackets where id='${bracket}' for update`;
  await race(bracketLock, reconcile, reconcile, async (results) => {
    results.forEach(success);
    assert.equal(results.map((r) => Number(r.stdout)).reduce((a, b) => a + b), 1);
    assert.equal(await run(`select count(*)=1 and min(id::text)='${offer}' from public.registrations
      where tournament_bracket_id='${bracket}' and waitlist_offer_status='offered';`), "t");
  }, "concurrent reconciliation reserves the only vacancy for the FIFO head");
  await race(bracketLock, member(accept), reconcile, async (results) => {
    results.forEach(success);
    assert.equal(await run(`select count(*)=8 from public.registrations where tournament_bracket_id='${bracket}'
      and (registration_status in('pending','manual_review','approved') or waitlist_offer_status='offered');`), "t");
    assert.equal(await run(`select waitlist_offer_status is null from public.registrations where id='a1400000-0000-4000-8000-000000000004';`), "t");
  }, "offer acceptance racing reconciliation cannot overfill the cohort");
  await run(member("select * from public.withdraw_tournament_registration('a1400000-0000-4000-8000-000000000006');", 5));
  assert.equal(await run("select waitlist_offer_status='offered' from public.registrations where id='a1400000-0000-4000-8000-000000000004';"), "t");
  passed("ungated withdrawal offers the vacancy to the next FIFO member");

  // A newly introduced legal-document lock wait must not let a request slip
  // past its pre-existing deadline. Each actor reaches a proven lock wait.
  for (const [label, setup, sql, error] of [
    ["ballot", `update public.polls set closes_at=clock_timestamp()+interval '750 milliseconds' where id='${poll}';`, retry, /42501.*Poll unavailable/],
    ["dice", `update public.tournament_matches set deadline_at=clock_timestamp()+interval '750 milliseconds' where id='${match}';`, dice(), /55000.*The Match deadline has elapsed/],
    ["offer", `update public.registrations set waitlist_offer_created_at=statement_timestamp()-interval '24 hours'+interval '750 milliseconds',waitlist_offer_expires_at=statement_timestamp()+interval '750 milliseconds' where id='a1400000-0000-4000-8000-000000000004';`, "select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000004','accept');", /P0001.*This waitlist offer has expired/],
  ]) {
    if (label === "offer") await run(`insert into public.account_legal_acceptances(clerk_user_id,terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,terms_accepted,privacy_acknowledged)
      select 'member-rpc-test-2',terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,true,true from public.account_legal_acceptances where clerk_user_id='member-rpc-test-1';`);
    await run(`begin; alter table public.polls disable trigger user; alter table public.tournament_matches disable trigger user;
      alter table public.registrations disable trigger user; ${setup}
      alter table public.polls enable trigger user; alter table public.tournament_matches enable trigger user;
      alter table public.registrations enable trigger user; commit;`);
    const gate = await holder("select 1 from public.legal_documents where status='effective' order by document_kind for update");
    const actor = start(member(sql, label === "offer" ? 2 : 1), "member-rpc-race-deadline");
    await waitLocked("member-rpc-race-deadline");
    await delay(850);
    await release(gate);
    const result = await actor.done;
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, error);
    passed(`${label} rechecks deadline after the new legal lock wait`);
  }
  await run(`begin; alter table public.polls disable trigger user;
    update public.polls set closes_at=clock_timestamp()+interval '1 day' where id='${poll}';
    alter table public.polls enable trigger user; commit;`);
  const acceptedMember = await holder(member(retry));
  const writer = await run(`set request.jwt.claim.role='service_role';
    set request.jwt.claims='{"role":"service_role"}';
    select count(*) from public.accept_current_account_legal_documents('member-rpc-test-1',
      'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',true,true);`);
  assert.equal(writer, "1");
  passed("canonical acceptance writer shares legal locks with a live member transaction");
  const activation = start(`begin;
    update public.legal_documents set status='superseded' where id='a1000000-0000-4000-8000-000000000002';
    insert into public.legal_documents(id,document_kind,version,immutable_url,status,published_at,effective_at,sha256)
    values('a1000000-0000-4000-8000-000000000009','privacy','local-race-successor',
      'https://local-test.invalid/legal/member-rpc-9.pdf','effective',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',repeat('f',64));
    commit;`, "member-rpc-race-activation");
  await waitLocked("member-rpc-race-activation");
  await release(acceptedMember);
  success(await activation.done);
  const obsoleteRetry = await start(member(retry), "member-rpc-race-obsolete-retry").done;
  assert.notEqual(obsoleteRetry.code, 0);
  assert.match(obsoleteRetry.stderr, /42501.*ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED/);
  passed("successor activation waits for member transaction then invalidates the old exact pair");
  console.log(`Passed ${assertions} controlled PostgreSQL concurrency assertions.`);
} finally {
  for (const child of processes) child.kill();
  await Promise.all([...processes].map((child) => new Promise((resolve) => child.once("close", resolve))));
  if (created) {
    await run(`drop database ${database};`, "postgres");
    await run(`drop role if exists ${role};`, "postgres");
    console.log("Removed only the newly created synthetic race database and role.");
  }
}
