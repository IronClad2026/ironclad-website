// Rollback-only negative proofs on the attested synthetic loopback rehearsal.
import assert from "node:assert/strict";
import { preflightSql } from "../../scripts/consolidated-release/sql.mjs";
import { LEGACY_PRO_CONTINUATION } from "../../scripts/consolidated-release/legacy-pro-transition.mjs";

export async function checkLegacyProReleaseGate(client) {
  // PostgreSQL renders timestamptz values in jsonb using the current timezone.
  // The real generated query sets LOCAL UTC; the extracted fixture SELECT must
  // use the same canonical session renderer across every rollback as well.
  const initialTimezone = (await client.query("select current_setting('TimeZone') as value")).rows[0].value;
  try {
    await client.query("select set_config('TimeZone','UTC',false)");
    return await checkLegacyProReleaseGateUtc(client);
  } finally {
    await client.query("select set_config('TimeZone',$1,false)", [initialTimezone]);
  }
}

async function checkLegacyProReleaseGateUtc(client) {
  assert.equal((await client.query("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal' as ok")).rows[0].ok, true);
  assert.equal((await client.query("select count(*)::integer as n from public.players where clerk_user_id not like 'local-consolidated-%'")).rows[0].n, 0);
  const generated = preflightSql({ candidateSha: "a".repeat(40), targetRef: "nsyjtqpvyxlzyujlbzos", tournamentIds: [LEGACY_PRO_CONTINUATION.tournamentId], phase: "after-activation" });
  // The exact generated SELECT is tested inside each synthetic fixture's outer
  // transaction. Its production entry point retains the READ ONLY transaction.
  const select = generated.slice(generated.indexOf("\nwith requested_ids"), generated.lastIndexOf("\nrollback;"));
  assert.match(select, /^\s*with requested_ids/);
  assert(!/\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|call|perform)\b/i.test(select));
  const read = async () => (await client.query(select)).rows[0].jsonb_build_object;
  const result = await client.query(generated);
  const baseline = (Array.isArray(result) ? result : [result]).find((entry) => entry.rows?.[0]?.jsonb_build_object)?.rows[0].jsonb_build_object;
  assert.equal(baseline?.schemaVersion, 2);
  assert.equal(baseline?.readOnly, true);
  assert.equal(baseline?.checks.legacyProTransitionSourceMismatch, 0);
  assert.equal(baseline?.checks.legacyProTransitionMarkerMismatch, 0);
  assert.equal(baseline?.checks.partialLegacyMainSeasons, 0);
  const steps = ["Exact recognized legacy event-one continuation passes the real READ ONLY aggregate gate, including genuine zero-point withheld records"];
  const { seasonId, tournamentId, tournamentBracketId } = LEGACY_PRO_CONTINUATION;
  const wrong = "f0000000-0000-4000-8000-000000000091";
  const checks = [
    ["Unexpected season identity fails", `update public.leaderboard_seasons set id='${wrong}' where id='${seasonId}'`, "legacyProTransitionSourceMismatch"],
    ["Unexpected event identity fails", `update public.tournaments set id='${wrong}' where id='${tournamentId}'`, "legacyProTransitionSourceMismatch"],
    ["Unexpected Main bracket identity fails", `update public.tournament_brackets set id='${wrong}' where id='${tournamentBracketId}'`, "legacyProTransitionSourceMismatch"],
    ["Changed source season year fails", `update public.leaderboard_seasons set year=2027 where id='${seasonId}'`, "legacyProTransitionSourceMismatch"],
    ["Changed source season number fails", `update public.leaderboard_seasons set season_number=2 where id='${seasonId}'`, "legacyProTransitionSourceMismatch"],
    ["Wrong genuine qualifying slot fails", `update public.leaderboard_tournament_season_memberships set qualifying_event_number=2 where tournament_id='${tournamentId}'`, "legacyProTransitionSourceMismatch"],
    ["Unscored membership fails", `update public.leaderboard_tournament_season_memberships set scored_at=null where tournament_id='${tournamentId}'`, "legacyProTransitionSourceMismatch"],
    ["Voided source membership fails", `update public.leaderboard_tournament_season_memberships set voided_at=clock_timestamp(),voided_by_clerk_user_id='local-consolidated-admin',void_reason='synthetic negative proof' where tournament_id='${tournamentId}'`, "legacyProTransitionSourceMismatch"],
    ["Changed Main points fail", `update public.leaderboard_point_events set points=points+1 where id=(select id from public.leaderboard_point_events where tournament_id='${tournamentId}' and bracket_type='main' order by id limit 1)`, "legacyProTransitionSourceMismatch"],
    ["Nonzero withheld participation fails", `update public.leaderboard_point_events set points=1 where tournament_id='${tournamentId}' and bracket_type='main' and event_type='participation_withheld'`, "legacyProTransitionSourceMismatch"],
    ["Non-genuine source event type fails without changing count or points", `update public.leaderboard_point_events set event_type='admin_adjustment' where id=(select id from public.leaderboard_point_events where tournament_id='${tournamentId}' and bracket_type='main' and event_type='participation' order by id limit 1)`, "legacyProTransitionSourceMismatch"],
    ["Changed point provenance fails", `update public.leaderboard_point_events set source='admin' where id=(select id from public.leaderboard_point_events where tournament_id='${tournamentId}' order by id limit 1)`, "legacyProTransitionSourceMismatch"],
    ["Wrong direct source bracket fails", `update public.leaderboard_point_events set tournament_bracket_id=(select id from public.tournament_brackets where tournament_id='${tournamentId}' and name='Academy') where id=(select id from public.leaderboard_point_events where tournament_id='${tournamentId}' and bracket_type='main' order by id limit 1)`, "legacyProTransitionSourceMismatch"],
    ["Missing source point fails", `delete from public.leaderboard_point_events where id=(select id from public.leaderboard_point_events where tournament_id='${tournamentId}' order by id limit 1)`, "legacyProTransitionSourceMismatch"],
    ["Changed settlement checksum fails its bound marker", `update public.leaderboard_division_settlements set calculation_checksum=repeat('f',32) where tournament_bracket_id='${tournamentBracketId}'`, "legacyProTransitionMarkerMismatch"],
    ["Unfinished source match fails", `update public.tournament_matches set status='in_progress' where id=(select m.id from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id where g.tournament_bracket_id='${tournamentBracketId}' order by m.id limit 1)`, "legacyProTransitionSourceMismatch"],
    ["Source season under review fails", `update public.leaderboard_seasons set finalized_at=clock_timestamp(),is_active=false,under_review_at=clock_timestamp(),under_review_reason='synthetic negative proof',under_review_by_clerk_user_id='local-consolidated-admin',under_review_tournament_id='${tournamentId}' where id='${seasonId}'`, "legacyProTransitionSourceMismatch"],
    ["Premature source finalization fails", `update public.leaderboard_seasons set finalized_at=clock_timestamp(),is_active=false where id='${seasonId}'`, "legacyProTransitionSourceMismatch"],
    ["Premature champion snapshot fails", `insert into public.leaderboard_season_champions(season_id,player_id,bracket_type,final_rank,final_points) values('${seasonId}',(select player_id from public.leaderboard_point_events where tournament_id='${tournamentId}' and bracket_type='main' order by id limit 1),'main',1,105)`, "legacyProTransitionSourceMismatch"],
    ["Unrecognized partial Main season remains a blocker", "insert into public.leaderboard_seasons(id,name,year,season_number,start_date,end_date,is_active,official_bracket_type) values('f0000000-0000-4000-8000-000000000092','Local unknown partial',2090,1,'2090-01-01','2090-12-31',false,'main')", "partialLegacyMainSeasons"],
    ["Additional membership is not a recognized event-one source", `insert into public.leaderboard_tournament_season_memberships(tournament_id,season_id,qualifying_event_number,scored_at) values('${wrong}','${seasonId}',2,clock_timestamp())`, "legacyProTransitionSourceMismatch"],
    ["Wrong marker source identity fails its exact authority", `update ironclad_private.legacy_main_pro_season_transition set tournament_id='${wrong}'`, "legacyProTransitionMarkerMismatch", "23514"],
    ["Changed marker source digest fails", "update ironclad_private.legacy_main_pro_season_transition set source_point_sha256=repeat('0',64)", "legacyProTransitionMarkerMismatch"],
    ["Inactive marker cannot pass the activation boundary", "update ironclad_private.legacy_main_pro_season_transition set activated_at=null", "legacyProTransitionMarkerMismatch"],
    ["Missing marker fails", "delete from ironclad_private.legacy_main_pro_season_transition", "legacyProTransitionMarkerMismatch"],
  ];
  for (const [name, mutation, check, requiredRejection] of checks) {
    await client.query("begin");
    try {
      await client.query("set local session_replication_role=replica");
      if (requiredRejection) {
        let rejected = false;
        try { await client.query(mutation); }
        catch (error) { assert.equal(error.code, requiredRejection, name); rejected = true; }
        assert(rejected, name);
      } else {
        await client.query(mutation);
        await client.query("set local session_replication_role=origin");
        const snapshot = await read();
        assert(snapshot.checks[check] > 0, name);
      }
      steps.push(name);
    } finally { await client.query("rollback"); }
    const preserved = await read();
    assert.equal(preserved.checks.legacyProTransitionSourceMismatch, 0);
    assert.equal(preserved.checks.legacyProTransitionMarkerMismatch, 0);
    assert.equal(preserved.checks.partialLegacyMainSeasons, 0);
    assert.deepEqual(preserved.tables, baseline.tables, "Negative gate fixture rollback changed historical table fingerprints");
    assert.deepEqual(preserved.legacyProContinuation, baseline.legacyProContinuation, "Negative gate fixture rollback changed source/marker fingerprints");
  }
  await client.query("begin");
  try {
    await client.query("set local session_replication_role=replica");
    let rejected = false;
    try {
      await client.query(`insert into public.leaderboard_tournament_season_memberships(tournament_id,season_id,qualifying_event_number,scored_at) values('${wrong}','${seasonId}',1,clock_timestamp())`);
    } catch (error) {
      assert.equal(error.code, "23505", "Duplicated genuine qualifying slot must be rejected by its existing unique authority");
      rejected = true;
    }
    assert(rejected);
    steps.push("Duplicate genuine qualifying slot fails existing uniqueness without bypassing authority");
  } finally { await client.query("rollback"); }
  assert.deepEqual((await read()).tables, baseline.tables);
  return steps;
}
