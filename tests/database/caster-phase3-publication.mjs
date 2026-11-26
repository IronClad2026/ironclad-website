// P03_PG_PORT=56624 node tests/database/caster-phase3-publication.mjs /path/to/local/psql
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { localClient, localPsqlArgument } from "../../scripts/p03-1/local-pg.mjs";

const read = (file) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const database = "p03_caster_phase3_" + Date.now();
const client = localClient(localPsqlArgument(), { database });
const inService = (sql) => client.run(`
  set role service_role;
  set request.jwt.claims = '{"role":"service_role"}';
  ${sql}
`);

assert.equal(await client.run(
  `select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port};`,
  { db: "postgres" },
), "t");
assert.equal(await client.run(
  `select count(*) from pg_database where datname='${database}';`,
  { db: "postgres" },
), "0", "Refuse to overwrite a database");
await client.run(`create database ${database};`, { db: "postgres" });

try {
  await client.run(read("tests/database/local-supabase-replay-prelude.sql") + "\n"
    + read("tests/database/match-room-realtime-local-prelude.sql"));
  const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    const sql = read("supabase/migrations/" + name).replace(
      /^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,
      "-- Local-only non-networking signatures are provided by the replay prelude.",
    );
    try {
      await client.run(sql);
    } catch (error) {
      throw new Error("Migration " + name + ": " + error.message, { cause: error });
    }
  }
  console.log("PASS full disposable PostgreSQL migration replay: " + migrations.length);

  await client.run(read("tests/database/caster-phase3-publication.sql"));
  console.log("PASS publication, frozen approvals, private fields and images, role isolation, moderation and stable URLs");
  await assert.rejects(client.run(`
    set role authenticated;
    set request.jwt.claims = '{"role":"authenticated","sub":"user_CasterPhase3Owner"}';
    select public.caster_phase3_owner('user_CasterPhase3Owner');
  `), /permission denied/i);
  await assert.rejects(client.run(`
    set role anon;
    set request.jwt.claims = '{"role":"anon"}';
    select public.caster_phase3_directory(0,100);
  `), /permission denied/i);
  console.log("PASS authenticated and anonymous roles cannot directly call service-only RPCs");

  const raceId = await inService(`
    select public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Race',0)#>>'{casters,0,application_id}';
  `);
  assert.match(raceId, /^[0-9a-f-]{36}$/);
  const [publish, suspend] = await Promise.all([
    inService(`select public.caster_phase3_publish('user_CasterPhase3Race',2)->>'status';`),
    inService(`
      select public.caster_phase3_moderate('user_CasterPhase3Staff','${raceId}',0,'suspend','Synthetic moderation race')->>'status';
    `),
  ]);
  assert.ok(["ok", "locked"].includes(publish), publish);
  assert.equal(suspend, "ok");
  assert.equal(await inService(`
    select public.caster_phase3_public_profile('caster') is null
      and public.caster_phase3_owner('user_CasterPhase3Race')#>>'{profile,membership_status}'='suspended';
  `), "t");
  assert.equal(await inService(`
    select public.caster_phase3_moderate('user_CasterPhase3Staff','${raceId}',1,'reinstate','Synthetic reinstatement')->>'status';
  `), "ok");
  assert.equal(await inService(`
    select public.caster_phase3_publish('user_CasterPhase3Race',2)#>>'{profile,slug}';
  `), "caster", "The reserved invitation route must not receive a public slug");
  console.log("PASS concurrent publish and suspension preserve moderation authority and the invitation route");

  const closurePublish = () => inService(`
    select public.caster_phase3_publish('user_CasterPhase3Closed',1)#>>'{profile,publication_id}';
  `);
  const [firstVersion, secondVersion] = await Promise.all([closurePublish(), closurePublish()]);
  assert.match(firstVersion, /^[0-9a-f-]{36}$/);
  assert.equal(firstVersion, secondVersion);
  const avatar = await inService(`select public.caster_phase3_public_profile('caster-closure')->>'avatar';`);
  assert.match(avatar, /^[0-9a-f-]{36}$/);
  assert.equal(await inService(`
    select public.caster_phase3_public_media('caster-closure','${firstVersion}','${avatar}') is not null;
  `), "t");
  assert.equal(await inService(`
    select public.caster_phase3_save('user_CasterPhase3Closed',1,
      public.caster_phase3_owner('user_CasterPhase3Closed')#>'{profile,draft}',false)->>'status';
  `), "ok");

  const [republish, closeAccount] = await Promise.all([
    inService(`select public.caster_phase3_publish('user_CasterPhase3Closed',2)->>'status';`),
    inService(`select public.close_ironclad_player_account('user_CasterPhase3Closed')->>'outcome';`),
  ]);
  assert.ok(["ok", "closed"].includes(republish), republish);
  assert.equal(closeAccount, "not_found", "The caster-only test account must be closed without a competitive row");
  assert.equal(await inService(`
    select public.caster_phase3_public_profile('caster-closure') is null
      and public.caster_phase3_public_media('caster-closure','${firstVersion}','${avatar}') is null
      and not exists(select 1 from jsonb_array_elements(public.caster_phase3_directory(0,100)) as card
        where card->>'slug'='caster-closure')
      and public.caster_phase3_owner('user_CasterPhase3Closed')->>'status'='closed';
  `), "t");
  console.log("PASS concurrent same-version publishing is idempotent and account closure immediately removes public access");
} finally {
  await client.run(`drop database ${database};`, { db: "postgres" });
}
