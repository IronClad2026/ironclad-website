// P03_PG_PORT=56624 node tests/database/caster-phase4-coverage.mjs /path/to/local/psql
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { localClient, localPsqlArgument } from "../../scripts/p03-1/local-pg.mjs";

const read = (file) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const database = "p03_caster_phase4_" + Date.now();
const client = localClient(localPsqlArgument(), { database });
const service = (sql) => client.run(`
  set role service_role;
  set request.jwt.claims = '{"role":"service_role"}';
  ${sql}
`);

assert.equal(await client.run(
  `select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port};`, { db: "postgres" },
), "t");
assert.equal(await client.run(
  `select count(*) from pg_database where datname='${database}';`, { db: "postgres" },
), "0", "Refuse to overwrite a database");
await client.run(`create database ${database};`, { db: "postgres" });

const assertProtected = (role, sql) => assert.rejects(client.run(`
  set role ${role};
  set request.jwt.claims = '{"role":"${role}","sub":"user_CasterPhase3Owner"}';
  ${sql}
`), /permission denied/i);
const uuid = (n) => "ca570004-0000-4000-8000-" + String(n).padStart(12, "0");
const mediaMigration = "20261127052305_caster_tournament_media.sql";

async function applyMigration(name) {
  try {
    await client.run(read("supabase/migrations/" + name).replace(
      /^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,
      "-- Local-only non-networking signatures are provided by the replay prelude.",
    ));
  } catch (error) {
    throw new Error("Migration " + name + ": " + error.message, { cause: error });
  }
}

try {
  await client.run(read("tests/database/local-supabase-replay-prelude.sql") + "\n"
    + read("tests/database/match-room-realtime-local-prelude.sql"));
  const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql")).sort();
  const transition = migrations.indexOf(mediaMigration);
  assert.ok(transition > 0, "Caster media migration is missing");
  for (const name of migrations.slice(0, transition)) await applyMigration(name);
  console.log("PASS disposable PostgreSQL pre-transition migration replay: " + transition);

  await client.run(read("tests/database/caster-phase3-publication.sql"));
  await client.run(read("tests/database/caster-phase4-coverage.sql"));
  console.log("PASS Phase 3 regressions and Phase 4 lifecycle, scope ancestry, permissions, media and history");
  await assertProtected("anon", `select public.caster_phase4_public_schedules(array['${uuid(1)}'::uuid]);`);
  await assertProtected("authenticated", "select public.caster_phase4_owner('user_CasterPhase3Owner');");
  await assertProtected("service_role", "select * from ironclad_private.caster_assignment_events;");
  await assert.rejects(service(`
    select public.caster_phase4_admin_list('user_CasterPhase3Other',null,null,0);
  `), /Caster staff access required/i);
  console.log("PASS direct client, raw service table and non-staff administration denials");

  const duplicate = () => service(`
    select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array[
      (select (a->>'application_id')::uuid from jsonb_array_elements(
        public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Race',0)->'casters') a)
    ],'${uuid(2)}','${uuid(12)}',null,null,null,null,null,false,null)->>'status';
  `);
  const duplicateResults = await Promise.all([duplicate(), duplicate()]);
  assert.deepEqual(duplicateResults.sort(), ["duplicate", "ok"]);
  console.log("PASS simultaneous assignment creation commits one active record");

  const decisionId = await service(`
    select public.caster_phase4_admin_list('user_CasterPhase3Staff','${uuid(2)}',null,0)#>>'{assignments,0,id}';
  `);
  assert.match(decisionId, /^[0-9a-f-]{36}$/);
  const decide = (action) => service(`
    select public.caster_phase4_admin_save('user_CasterPhase3Staff','${decisionId}',1,null,null,null,null,'${action}',
      null,now()-interval '1 hour',null,null,null,false,'Synthetic decision concurrency')->>'status';
  `);
  const decisions = await Promise.all([decide("complete"), decide("cancel")]);
  assert.deepEqual(decisions.sort(), ["conflict", "ok"]);
  assert.equal(await service(`
    select jsonb_array_length(public.caster_phase4_admin_history('user_CasterPhase3Staff','${decisionId}')->'events');
  `), "2");
  console.log("PASS concurrent decisions preserve one transition and one audit event");

  const closedId = await service(`
    select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array[
      (select (a->>'application_id')::uuid from jsonb_array_elements(
        public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Closed',0)->'casters') a)
    ],'${uuid(2)}',null,null,null,null,null,null,false,null)#>>'{assignments,0,id}';
  `);
  assert.match(closedId, /^[0-9a-f-]{36}$/);
  const [complete, close] = await Promise.all([
    service(`
      select public.caster_phase4_admin_save('user_CasterPhase3Staff','${closedId}',1,null,null,null,null,'complete',
        null,now()-interval '1 hour',null,null,null,false,null)->>'status';
    `),
    service("select public.close_ironclad_player_account('user_CasterPhase3Closed')->>'outcome';"),
  ]);
  assert.equal(close, "not_found");
  assert.ok(["ok", "closed"].includes(complete), complete);
  assert.equal(await service("select public.caster_phase4_owner('user_CasterPhase3Closed')->>'status';"), "closed");
  assert.equal(await service(`
    select public.caster_phase4_admin_save('user_CasterPhase3Staff','${closedId}',${complete === "ok" ? 2 : 1},
      null,null,null,null,'${complete === "ok" ? "correct" : "complete"}',
      null,now()-interval '1 hour',null,null,null,false,'Attempt to edit after closure')->>'status';
  `), "closed");
  console.log("PASS concurrent Patch 2 closure and completion cannot retain caster access or permit later verification edits");

  const verifiedId = await service(`
    select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array[
      (select (a->>'application_id')::uuid from jsonb_array_elements(
        public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Other',0)->'casters') a)
    ],'${uuid(2)}',null,null,null,null,null,null,false,null)#>>'{assignments,0,id}';
  `);
  assert.match(verifiedId, /^[0-9a-f-]{36}$/);
  assert.equal(await service(`
    select public.caster_phase4_admin_save('user_CasterPhase3Staff','${verifiedId}',1,null,null,null,null,'complete',
      null,now()-interval '5 hours',null,null,null,false,null)->>'status';
  `), "ok");
  for (const name of migrations.slice(transition)) await applyMigration(name);
  await client.run(`set fixture.caster_verified_history='${verifiedId}';\n` + read("tests/database/caster-tournament-media.sql"));
  console.log("PASS complete migration replay and caster Tournament Media publication, scope, moderation, legacy preservation and account lifecycle");

  await assertProtected("anon", `select public.caster_media_public_tournaments(array['${uuid(1)}'::uuid]);`);
  await assertProtected("authenticated", "select public.caster_media_owner('user_CasterPhase3Other');");
  await assertProtected("service_role", "select * from ironclad_private.caster_media_events;");
  await assertProtected("service_role", `select public.caster_phase4_public_schedules(array['${uuid(1)}'::uuid]);`);
  await assertProtected("service_role", `select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array['${uuid(2)}'::uuid],'${uuid(1)}',null,null,null,null,null,null,false,null);`);
  assert.equal(await client.run(`select to_regprocedure('public.caster_phase4_admin_save(text,uuid,integer,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,boolean,text)') is null;`), "t");
  console.log("PASS retired scheduling authority and denied direct browser/provider-service table paths");

  const createMedia = () => service(`select public.caster_media_save('user_CasterPhase3Other',null,null,'${uuid(1)}',null,null,
    'Concurrent caster media','https://www.twitch.tv/videos/820',null,'save')->>'status';`);
  assert.deepEqual((await Promise.all([createMedia(), createMedia()])).sort(), ["duplicate", "ok"]);
  const mediaId = await service(`select item->>'id' from jsonb_array_elements(
    public.caster_media_owner('user_CasterPhase3Other')->'media') item where item->>'url'='https://www.twitch.tv/videos/820';`);
  assert.match(mediaId, /^[0-9a-f-]{36}$/);
  assert.equal(await client.run("select count(*) from public.tournament_media where url='https://www.twitch.tv/videos/820';"), "1");
  await assert.rejects(service(`update public.tournament_media set published=true where id='${mediaId}';`), /authorized workflow/);
  await assert.rejects(service(`delete from public.tournament_media where id='${mediaId}';`), /authorized workflow/);
  const nativeId = await service(`insert into public.tournament_media(tournament_id,title,url,media_type,published)
    values('${uuid(1)}','Legacy admin entry','https://www.twitch.tv/videos/821','video',true) returning id;`);
  assert.match(nativeId, /^[0-9a-f-]{36}$/);
  assert.equal(await service(`update public.tournament_media set title='Legacy admin edit' where id='${nativeId}' returning title;`), "Legacy admin edit");
  assert.equal(await service(`delete from public.tournament_media where id='${nativeId}' returning id;`), nativeId);

  const ownerEdit = () => service(`select public.caster_media_save('user_CasterPhase3Other','${mediaId}',1,'${uuid(1)}',null,null,
    'Owner update','https://www.twitch.tv/videos/820',null,'save')->>'status';`);
  const staffHide = (version) => service(`select public.caster_media_admin_moderate('user_CasterPhase3Staff','${mediaId}',${version},
    'hide',null,null,null,'Concurrent moderation')->>'status';`);
  const [edit, hide] = await Promise.all([ownerEdit(), staffHide(1)]);
  if (hide === "conflict") {
    assert.equal(edit, "ok");
    assert.equal(await staffHide(2), "ok");
  } else {
    assert.equal(hide, "ok");
    assert.equal(edit, "moderated");
  }
  assert.equal(await ownerEdit(), "moderated");
  assert.equal(await service(`select not exists(select from jsonb_array_elements(
    public.caster_media_public_tournaments(array['${uuid(1)}'::uuid])) item where item->>'id'='${mediaId}');`), "t");
  console.log("PASS concurrent duplicate prevention and edit/moderation exclusion leave one safely hidden canonical media row");
} finally {
  await client.run(`drop database ${database};`, { db: "postgres" });
}
