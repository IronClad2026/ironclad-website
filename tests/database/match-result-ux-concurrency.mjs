// Usage: node tests/database/match-result-ux-concurrency.mjs <local-psql.exe> [disposable-db] [local-template]
// Uses a NEW disposable database cloned from the locally replayed schema.
// No credentials, remote host, Staging fixture, or production endpoint is used.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const psql = process.argv[2];
if (!psql) throw new Error("Local psql executable required");
const database = process.argv[3] ?? `ironclad_match_ux_${Date.now()}`;
const template = process.argv[4] ?? "postgres";
if (!/^ironclad_[a-z0-9_]+$/.test(database)) {
  throw new Error("A disposable ironclad_* database is required");
}
if (!/^(postgres|ironclad_[a-z0-9_]+)$/.test(template)) {
  throw new Error("A local replay template is required");
}
function start(sql, name = "ux-query", db = database) {
  const child = spawn(
    psql,
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55462",
      "-U",
      "postgres",
      "-d",
      db,
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      windowsHide: true,
      env: { ...process.env, PGAPPNAME: name },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const result = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
  child.stdin.end("set statement_timeout='15s';\n" + sql);
  return result;
}
async function query(sql, db = database) {
  const result = await start(sql, "ux-query", db);
  assert.equal(result.code, 0, result.output);
  return result.output.trim().split("\n").at(-1);
}
async function until(sql) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await query(sql)) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Expected database lock/clock state was not observed");
}
const waiting = (name) =>
  `select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock');`;
assert.equal(
  await query(
    "select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=55462;",
    "postgres"
  ),
  "t"
);
await query(`create database ${database} template ${template};`, "postgres");
const source = readFileSync(
  new URL("./match-result-ux-confirmation.sql", import.meta.url),
  "utf8"
);
// Reuse only fixture construction, WITHOUT the rollback test's clock stubs.
const fixture = source.slice(
  source.indexOf("set client_min_messages"),
  source.indexOf("create temp table ux_reports")
);
await query(
  "begin;\n" +
    fixture +
    "\nselect pg_temp.report(1); select pg_temp.report(3); select pg_temp.report(5); commit;"
);

for (const [number, first] of [
  [1, "confirm"],
  [3, "dispute"],
  [5, "expiry"],
]) {
  const match = `b5000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const group = await query(
    `select id from public.match_result_report_groups where match_id='${match}';`
  );
  const confirm = `select public.confirm_match_result_report_group_api('${group}','p1-match-result-player-two');`;
  const dispute = `select public.dispute_match_result_report_group_api('${group}','p1-match-result-player-two','Concurrent fixture dispute');`;
  const expiry = "select public.auto_approve_expired_match_result_groups(50);";
  await query(
    `update public.match_result_report_groups set confirmation_deadline_at=clock_timestamp()+interval '${first === "expiry" ? "-1" : "2"} seconds' where id='${group}';`
  );
  const blocker = start(
    `begin; select id from public.tournament_matches where id='${match}' for update; select pg_sleep(5); commit;`,
    "ux-blocker"
  );
  await until(
    "select exists(select 1 from pg_stat_activity where application_name='ux-blocker' and wait_event='PgSleep');"
  );
  const winner = start(
    first === "confirm" ? confirm : first === "dispute" ? dispute : expiry,
    "ux-first"
  );
  await until(waiting("ux-first"));
  const loser = start(first === "confirm" ? dispute : confirm, "ux-second");
  await until(waiting("ux-second"));
  let third;
  if (first !== "expiry") {
    await until(
      `select clock_timestamp()>=confirmation_deadline_at from public.match_result_report_groups where id='${group}';`
    );
    third = start(expiry, "ux-expiry");
  } else third = start(dispute, "ux-dispute");
  const results = await Promise.all([blocker, winner, loser, third]);
  assert.equal(results[0].code, 0, results[0].output);
  assert.equal(results[1].code, 0, results[1].output);
  assert.notEqual(results[2].code, 0, "Losing player action must fail");
  assert(
    !results.some((result) =>
      /deadlock detected|statement timeout/i.test(result.output)
    ),
    "No deadlock or timeout"
  );
  const expected =
    first === "confirm"
      ? "confirmed"
      : first === "dispute"
        ? "disputed"
        : "auto_approved";
  assert.equal(
    await query(
      `select status from public.match_result_report_groups where id='${group}';`
    ),
    expected
  );
  assert.equal(
    await query(
      `select status from public.tournament_matches where id='${match}';`
    ),
    first === "dispute" ? "pending_review" : "completed"
  );
  assert.equal(
    await query(expiry),
    "0",
    "Repeated expiry must not finalize again"
  );
  console.log(
    `PASS: ${first} wins concurrent confirmation/dispute/expiry; state converges`
  );
}
console.log(
  "PASS: three races on local port 55462; disposable database retained for inspection"
);
