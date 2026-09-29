// Local-only runner: node <script> <psql.exe> <port> <empty fixture database>.
// Replay all migrations first. This retains evidence in the disposable database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [psql, port, database] = process.argv.slice(2);
assert.equal(process.argv.length, 5);
assert(psql && /^\d{2,5}$/.test(port) && Number(port) <= 65535);
assert(/^p03_four_division_fixtures_\d+$/.test(database), "Disposable local database required");
const id = (kind, event, slot = 0) => {
  const hex = createHash("md5").update(`four-division-lifecycle:${kind}:${event}:${slot}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const requests = new Set();
const service = "set request.jwt.claims='{\"role\":\"service_role\",\"sub\":\"four-division-local-rehearsal\"}';";
function start(sql, app = "four-division-control") {
  const child = spawn(psql, ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database], {
    windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, PGAPPNAME: app, PGCONNECT_TIMEOUT: "5" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  requests.add(child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolveResult) => {
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on("error", (error) => { clearTimeout(timer); requests.delete(child); resolveResult({ code: null, stdout, stderr: error.message }); });
    child.on("close", (code) => { clearTimeout(timer); requests.delete(child); resolveResult({ code, stdout: stdout.trim(), stderr: stderr.trim() }); });
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end("set statement_timeout='45s'; set lock_timeout='15s'; set client_min_messages=warning;\n" + service + "\n" + sql);
  return done;
}
function success(result) {
  assert.equal(result.code, 0, result.stderr || "Local SQL failed");
  assert(!result.stderr.includes("40P01"), "Deadlock detected");
  return result.stdout;
}
const run = async (sql) => success(await start(sql));
const jsonRows = (output) => output.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
async function waitForSleep(app) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await run(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='PgSleep');`)).trim() === "t") return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
  }
  throw new Error("Controlled race window did not start");
}
const pointDigest = "select md5(string_agg(to_jsonb(e)::text,E'\\n' order by id)) from public.leaderboard_point_events e;";

try {
  const lifecycle = readFileSync(new URL("./four-division-lifecycle.sql", import.meta.url), "utf8");
  const bootstrap = await run("\\set persist 1\n\\set prepare_races 1\n" + lifecycle);
  const lifecycleEvidence = jsonRows(bootstrap).find((row) => row.result === "passed");
  assert(lifecycleEvidence);
  const beforeRetry = await run(pointDigest);
  const sameApp = "four-division-same-writer";
  const first = start(`begin; select pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0)); select pg_sleep(0.75); select public.settle_leaderboard_division('${id("Main", 1)}',null); commit;`, sameApp);
  await waitForSleep(sameApp);
  const second = start(`select public.settle_leaderboard_division('${id("Main", 1)}',null);`, "four-division-same-retry");
  for (const result of await Promise.all([first, second])) {
    const rows = jsonRows(success(result));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].settlementCreated, false);
    assert.equal(rows[0].pointEventsChanged, false);
  }
  assert.equal(await run(pointDigest), beforeRetry, "Concurrent retry changed point evidence");

  const finalSql = (division) => `select public.apply_admin_official_match_result_api('${id(`${division}-match-3`, 9, 1)}',3,0,'${id(`${division}-registration`, 9, 1)}','local-four-division-admin');`;
  const siblingApp = "four-division-main-final";
  const mainFinal = start(`begin; ${finalSql("Main")} select pg_sleep(0.75); commit;`, siblingApp);
  await waitForSleep(siblingApp);
  const proFinal = start(`begin; ${finalSql("Pro")} commit;`, "four-division-pro-final");
  for (const result of await Promise.all([mainFinal, proFinal])) success(result);
  await run(`select public.settle_leaderboard_division('${id("Main", 9)}',null); select public.settle_leaderboard_division('${id("Pro", 9)}',null); select public.recalculate_leaderboard_for_tournament('${id("event", 9)}',null);`);
  const duplicate = await start(finalSql("Pro"));
  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.stderr, /PT409/);
  // A local fault injection after point calculation must roll back accounting
  // atomically while leaving the separately committed official result factual.
  await run(`create function ironclad_private.four_division_rehearsal_fail_enqueue() returns trigger language plpgsql set search_path=pg_catalog as $$ begin
    if new.source_id='${id("event", 10)}' and current_setting('ironclad.fixture_fail_enqueue',true)='on' then
      raise exception 'Local rehearsal injected badge handoff failure' using errcode='40001';
    end if; return new; end $$;
    revoke all on function ironclad_private.four_division_rehearsal_fail_enqueue() from public,anon,authenticated,service_role;
    create trigger four_division_rehearsal_fail_enqueue before insert or update on ironclad_private.badge_reconciliation_targets for each row execute function ironclad_private.four_division_rehearsal_fail_enqueue();`);
  await run(`set ironclad.fixture_fail_enqueue='on'; select public.apply_admin_official_match_result_api('${id("Main-match-3", 10, 1)}',3,0,'${id("Main-registration", 10, 1)}','local-four-division-admin');`);
  const failedHandoff = await start(`set ironclad.fixture_fail_enqueue='on'; select public.settle_leaderboard_division('${id("Main", 10)}',null);`);
  assert.notEqual(failedHandoff.code, 0);
  assert.match(failedHandoff.stderr, /40001/);
  const rollback = JSON.parse(await run(`select jsonb_build_object(
    'matchComplete',(select status='completed' from public.tournament_matches where id='${id("Main-match-3", 10, 1)}'),
    'pointEvents',(select count(*) from public.leaderboard_point_events where tournament_id='${id("event", 10)}'),
    'receipts',(select count(*) from public.leaderboard_division_settlements where tournament_bracket_id='${id("Main", 10)}'),
    'badgeTargets',(select count(*) from ironclad_private.badge_reconciliation_targets where source_id='${id("event", 10)}')
  );`));
  assert.deepEqual(rollback, { matchComplete: true, pointEvents: 0, receipts: 0, badgeTargets: 0 });
  const recovery = jsonRows(await run(`select public.settle_leaderboard_division('${id("Main", 10)}',null);`));
  assert.equal(recovery[0].settlementCreated, true);
  assert.equal(recovery[0].pointEventsChanged, true);
  const recoveredDigest = await run(pointDigest);
  await run(`select public.settle_leaderboard_division('${id("Main", 10)}',null);`);
  assert.equal(await run(pointDigest), recoveredDigest);
  await run("drop trigger four_division_rehearsal_fail_enqueue on ironclad_private.badge_reconciliation_targets; drop function ironclad_private.four_division_rehearsal_fail_enqueue();");
  const counts = JSON.parse(await run(`select jsonb_build_object(
    'completedMatches',(select count(*) from public.tournament_matches where status='completed'),
    'settledDivisions',(select count(*) from public.leaderboard_division_settlements),
    'siblingEventComplete',(select status='completed' from public.tournaments where id='${id("event", 9)}'),
    'siblingEventSlot',(select qualifying_event_number from public.leaderboard_tournament_season_memberships where tournament_id='${id("event", 9)}'),
    'activeSeasons',(select count(*) from public.leaderboard_seasons where is_active),
    'duplicateEvents',(select count(*) from (select 1 from public.leaderboard_point_events where source in ('system','recalculation') group by season_id,tournament_id,tournament_bracket_id,registration_id,player_id,bracket_type,event_type having count(*)>case when event_type='round_passed' then 2 else 1 end) d)
  );`));
  assert.equal(counts.completedMatches, 84);
  assert.equal(counts.settledDivisions, 12);
  assert.equal(counts.siblingEventComplete, true);
  assert.equal(counts.siblingEventSlot, 2);
  assert.equal(counts.activeSeasons, 1);
  assert.equal(counts.duplicateEvents, 0);
  const frozenDigestSql = `select md5(jsonb_build_object(
    'champions',(select jsonb_agg(to_jsonb(c) order by c.id) from public.leaderboard_season_champions c join public.leaderboard_seasons s on s.id=c.season_id where s.finalized_at is not null),
    'standings',(select jsonb_agg(to_jsonb(p) order by p.player_id,p.bracket_type) from public.leaderboard_player_season_stats p join public.leaderboard_seasons s on s.id=p.season_id where s.finalized_at is not null and p.bracket_type=s.official_bracket_type)
  )::text);`;
  const frozenDigest = await run(frozenDigestSql);
  const reviewRows = jsonRows(await run(`begin;
    select public.void_tournament('${id("event", 1)}','Local finalized Pro review rehearsal','local-four-division-admin');
    select public.void_tournament('${id("event", 1)}','Local review retry','local-four-division-admin');
    select jsonb_build_object('underReview',(select under_review_at is not null from public.leaderboard_seasons where finalized_at is not null),
      'completed',(select status='completed' from public.tournaments where id='${id("event", 1)}'),
      'visibleChampions',(select champion_finish_count from public.get_player_badge_season_summary('${id("Pro-player", 0, 1)}')));
    rollback;`));
  assert.equal(reviewRows[0].outcome, "under_review");
  assert.equal(reviewRows[1].outcome, "already_under_review");
  assert.deepEqual(reviewRows[2], { underReview: true, completed: true, visibleChampions: 0 });
  assert.equal(await run(frozenDigestSql), frozenDigest);
  const voidRows = jsonRows(await run(`begin;
    select public.void_tournament('${id("event", 7)}','Local active Pro void rehearsal','local-four-division-admin');
    select public.void_tournament('${id("event", 7)}','Local active Pro void retry','local-four-division-admin');
    select jsonb_build_object('voided',(select status='voided' from public.tournaments where id='${id("event", 7)}'),
      'membershipVoided',(select voided_at is not null from public.leaderboard_tournament_season_memberships where tournament_id='${id("event", 7)}'),
      'remainingPoints',(select count(*) from public.leaderboard_point_events where tournament_id='${id("event", 7)}'),
      'validActiveSlots',(select count(*) from public.leaderboard_tournament_season_memberships m join public.leaderboard_seasons s on s.id=m.season_id where s.is_active and m.voided_at is null and m.qualifying_event_number is not null));
    rollback;`));
  assert.equal(voidRows[0].outcome, "voided");
  assert.equal(voidRows[1].outcome, "already_voided");
  assert.deepEqual(voidRows[2], { voided: true, membershipVoided: true, remainingPoints: 0, validActiveSlots: 1 });
  assert.equal(await run(frozenDigestSql), frozenDigest);
  const evidence = {
    timestamp: new Date().toISOString(), scope: "isolated-loopback-postgresql", database,
    lifecycle: lifecycleEvidence,
    concurrency: { sameDivisionRetry: "no-op; point digest unchanged", simultaneousSiblingFinals: "both committed; normal repair converged", repeatedOfficialResult: "PT409; existing result preserved", ...counts },
    failureRecovery: { injectedHandoffFailure: "40001", rollback, retry: "one receipt and factual points; next retry no-op" },
    terminalAuthority: { finalizedVoid: "under review; retry no-op; frozen history retained", underReviewBadges: "new champion authority withheld", activeVoid: "membership voided; points removed; no valid slot consumed", testsRolledBack: true },
    productionTouched: false,
  };
  const outputDirectory = resolve("test-results/four-division");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "lifecycle-evidence.json"), JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  for (const child of requests) child.kill();
}
