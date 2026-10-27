// Disposable synthetic PostgreSQL only. Never imports app clients or credentials.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "../consolidated-db/local-client.mjs";

const migration = "20261027181708_public_competitive_profile_read_projections.sql";
const sql = readFileSync(new URL(`../../supabase/migrations/${migration}`, import.meta.url), "utf8");
const evidence = new URL("../../../public-profile-evidence/", import.meta.url);
const client = await connect();
const steps = [];
const pass = (message) => { steps.push(message); console.log(`PASS ${message}`); };
const views = ["public_player_profiles", "public_player_showcases", "leaderboard_public_season_standings", "leaderboard_public_all_time_standings", "leaderboard_public_season_champions"];
const names = views.map((name) => `'${name}'`).join(",");
const catalog = `select c.oid::text, c.relname, c.relowner::text, c.relacl::text, c.reloptions,
  (select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attacl::text) order by a.attnum)
   from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${names}) order by c.relname`;
const functionCatalog = `select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' identity,
  p.oid::text,p.proowner::text,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig,
  md5(replace(pg_get_functiondef(p.oid),chr(13),'')) definition_hash
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','ironclad_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by 1`;
const fingerprints = async () => {
  const relations = (await client.query(`select format('%I.%I',n.nspname,c.relname) name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') order by 1`)).rows;
  const result = {};
  for (const { name } of relations) result[name] = (await client.query(`select count(*)::integer count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text) hash from ${name} t`)).rows[0];
  return result;
};
const facts = async () => {
  const result = {};
  for (const name of views.filter((name) => name.startsWith("leaderboard_"))) {
    result[name] = (await client.query(`select md5(coalesce(jsonb_agg(f order by f::text),'[]'::jsonb)::text) hash from (select to_jsonb(v)-array['id','player_id','display_name','in_game_name','player_name','country','region','current_elo','has_avatar','avatar_url'] f from public.${name} v) s`)).rows[0].hash;
  }
  return result;
};
const assertProjections = async (variant) => {
  await client.query("set role anon");
  try {
    for (const view of ["leaderboard_public_season_standings", "leaderboard_public_all_time_standings"]) {
      const rows = (await client.query(`select player_id::text,current_elo,country,region,has_avatar,display_name,in_game_name from public.${view} where bracket_type='main'`)).rows;
      for (const [index, elo] of [[0,1501],[1,1666],[2,null]]) {
        assert.deepEqual(rows.find((row) => row.player_id === ids[index]), {
          player_id: ids[index], current_elo: elo, country: "Australia", region: "Oceania", has_avatar: true,
          display_name: `Public test ${index}`, in_game_name: `Competitor ${index}`,
        });
      }
      assert(rows.some((row) => row.player_id === null && row.display_name === "Former Competitor" && row.in_game_name === "Former Competitor" && row.current_elo === null && row.country === null && row.region === null && !row.has_avatar));
    }
    pass(`${variant}: Season and All Time expose both legacy values, genuine null ELO and closed masking`);
    const profiles = (await client.query("select id::text,discord_username,avatar_url from public.public_player_profiles where id=any($1::uuid[])", [ids])).rows;
    assert.equal(profiles.length,3);
    assert.equal(profiles.find((row) => row.id === ids[0]).discord_username,"public.discord");
    assert.equal(profiles.find((row) => row.id === ids[1]).discord_username,null);
    assert(profiles.every((row) => row.avatar_url === null));
    pass(`${variant}: Directory active-only boundary, independent Discord opt-in, null raw avatar path`);
    const champions = (await client.query("select player_id::text,player_name,country,has_avatar,id from public.leaderboard_public_season_champions")).rows;
    assert(champions.some((row) => row.player_id === ids[1] && row.player_name === "Competitor 1" && row.country === "Australia" && row.has_avatar));
    assert(champions.some((row) => row.player_id === null && row.player_name === "Former Competitor" && row.country === null && !row.has_avatar && row.id.startsWith("private-champion:")));
    pass(`${variant}: Active legacy-false champion public, closed champion anonymized`);
    for (const name of ["leaderboard_player_season_stats","leaderboard_player_all_time_stats","leaderboard_point_events","leaderboard_season_champions"]) {
      assert.equal((await client.query("select has_table_privilege(current_user,$1,'select') allowed", [`public.${name}`])).rows[0].allowed,false);
    }
    pass(`${variant}: Actual anon reads succeed while raw leaderboard SELECT remains denied`);
  } finally { await client.query("reset role"); }
};
let ids;
try {
  assert.equal((await client.query("select count(*)::integer n from public.players where clerk_user_id not like 'local-consolidated-%'")).rows[0].n,0,"Non-synthetic player detected");
  await client.query(readFileSync(new URL("../../tests/consolidated-db/lifecycle-helpers.sql",import.meta.url),"utf8"));
  ids = (await client.query("select distinct s.player_id::text id from public.leaderboard_player_season_stats s join public.leaderboard_player_all_time_stats a on a.player_id=s.player_id and a.bracket_type=s.bracket_type where s.bracket_type='main' order by id limit 4")).rows.map((row) => row.id);
  assert.equal(ids.length,4,"Four existing synthetic ranked competitors required");
  await client.query("begin; set local session_replication_role=replica");
  for (let index=0;index<ids.length;index++) await client.query(`update public.players set public_profile_enabled=$2, current_elo=$3, display_name=$4, in_game_name=$5, country='Australia',region='Oceania',avatar_url='https://example.invalid/private-clerk-path',discord_public_enabled=$6,discord_username=$7,account_closed_at=case when $8 then now() else null end where id=$1`,[ids[index],index===0,index===2?null:index===1?1666:1501,`Public test ${index}`,`Competitor ${index}`,index===0,index===0?"public.discord":"private.discord",index===3]);
  await client.query(`insert into public.leaderboard_season_champions(season_id,player_id,bracket_type,final_rank,final_points) select (select season_id from public.leaderboard_player_season_stats where player_id=$1 and bracket_type='main' limit 1),p.id,'main',1,12 from public.players p where p.id=any($2::uuid[]) on conflict do nothing`,[ids[0],[ids[1],ids[3]]]);
  await client.query("commit");
  for (const variant of ["production-bridge","staging-no-bridge"]) {
    if (variant === "staging-no-bridge") {
      // Reproduce the audited Staging view contracts without deleting local history.
      await client.query("alter table ironclad_private.legacy_main_pro_season_transition rename to rehearsal_hidden_transition; alter view ironclad_private.leaderboard_official_season_standings rename to rehearsal_hidden_official_standings");
      const stage = JSON.parse(readFileSync(new URL("../../tests/fixtures/public-competitive-profile-previous-views.json",import.meta.url),"utf8")).views;
      // Production has one appended column. Only disposable fixture DDL removes it.
      await client.query("drop view public.leaderboard_public_season_standings");
      for(const view of stage) {
        await client.query(`create or replace view public.${view.name} with(security_barrier=true,security_invoker=false) as ${view.definition}`);
        await client.query(`grant select on public.${view.name} to anon, authenticated, service_role`);
      }
    }
    const before = await fingerprints(); const oldCatalog=(await client.query(catalog)).rows; const oldFacts=await facts();
    const oldFunctions=(await client.query(functionCatalog)).rows;
    await client.query(sql);
    assert.deepEqual(await fingerprints(),before,"Migration altered business rows");
    assert.deepEqual((await client.query(catalog)).rows,oldCatalog,"View owner/OID/ACL/options/column contract changed");
    assert.deepEqual(await facts(),oldFacts,"Migration altered competitive facts");
    const currentFunctions=(await client.query(functionCatalog)).rows;
    assert.deepEqual(currentFunctions.map(({definition_hash: ignored,...metadata}) => metadata),oldFunctions.map(({definition_hash: ignored,...metadata}) => metadata),"Function attributes/ownership/ACL/OIDs changed");
    const changedFunctions=currentFunctions.filter((row,index) => row.definition_hash !== oldFunctions[index].definition_hash);
    assert(changedFunctions.every((row) => /^(ironclad_private\.combat_highlight_state|public\.can_read_public_player_combat_highlight)\(/.test(row.identity)),"Unexpected function/write implementation changed");
    pass(`${variant}: All function attributes and grants unchanged; only approved read helper definitions may differ`);
    pass(`${variant}: All business rows, points/ranks/history, view OIDs/owners/ACL/options/column ACLs unchanged`);
    await assertProjections(variant);
    const results=await client.query(readFileSync(new URL("../../tests/database/public-competitive-profile-highlights.sql",import.meta.url),"utf8"));
    const highlightAssertions=results.flatMap((result) => result.rows ?? []).find((row) => typeof row.passed_assertions === "number")?.passed_assertions;
    assert(highlightAssertions>70,"Actual-role Highlights contract did not complete");
    assert.deepEqual(await fingerprints(),before,"Highlights rollback leaked business rows");
    pass(`${variant}: ${highlightAssertions} actual-role Highlights assertions passed, including legacy flags/closure/hidden/verification/owner preview/writes; full rollback exact`);
    await client.query(sql);
    assert.deepEqual(await fingerprints(),before,"Migration retry altered business rows");
    pass(`${variant}: Exact migration retry succeeds without data changes`);
  }
  writeFileSync(new URL("public-profiles-local-rehearsal.json",evidence),JSON.stringify({status:"PASS",migration,steps,providerMode:"native-compatibility",productionRowsImported:0,productionConnected:false},null,2)+"\n");
  console.log(JSON.stringify({status:"PASS",steps:steps.length}));
} finally { await client.query("rollback").catch(()=>{}); await client.end(); }
