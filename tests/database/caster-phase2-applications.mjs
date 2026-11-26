// Uses an existing fresh PostgreSQL 17 cluster on the P03 loopback ports.
// P03_PG_PORT=56624 node tests/database/caster-phase2-applications.mjs /path/to/psql
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { localClient, localPsqlArgument } from "../../scripts/p03-1/local-pg.mjs";

const read = (file) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const database = "p03_caster_phase2_" + Date.now();
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

  await client.run(read("tests/database/caster-phase2-applications.sql"));
  console.log("PASS lifecycle, database authority, account capability, notifications and private media");
  await assert.rejects(client.run(`
    set role authenticated;
    set request.jwt.claims = '{"role":"authenticated","sub":"user_CasterPhase2Owner"}';
    select public.caster_phase2_get('user_CasterPhase2Owner');
  `), /permission denied/i);

  // Keep both reviewers on a known revision even if the other commits first.
  const target = await inService(`
    select (result->>'id') || ' ' || (result->>'submitted_revision_id')
      from jsonb_array_elements(public.caster_phase2_admin_list('user_CasterPhase2Staff', 'submitted',
        'edited caster', 0)->'applications') as result;
  `);
  const [id, revision] = target.split(" ");
  for (const value of [id, revision]) assert.match(value, /^[0-9a-f-]{36}$/);
  const reviewExact = (actor, decision) => inService(`
    select public.caster_phase2_review('${actor}', '${id}', '${revision}', '${decision}',
      'Synthetic concurrency decision')->>'status';
  `);
  const reviews = await Promise.all([
    reviewExact("user_CasterPhase2Staff", "approve"),
    reviewExact("user_CasterPhase2SecondStaff", "request_changes"),
  ]);
  assert.deepEqual(reviews.sort(), ["conflict", "ok"]);
  assert.equal(await client.run(`
    select count(*) from public.notifications where recipient_clerk_user_id='user_CasterPhase2Race'
      and type='caster.application_updated';
  `), "1");
  console.log("PASS concurrent review commits one decision and one in-app notification");

  const contest = await Promise.all([
    inService(`
      select public.caster_phase1_claim_continuation('user_CasterPhase2MixedRace', repeat('b',64))->>'status';
    `),
    inService(`
      select public.caster_phase2_grant('user_CasterPhase2Staff','user_CasterPhase2MixedRace',
        'Synthetic direct grant race')->>'status';
    `),
  ]);
  assert.ok((contest[0] === "claimed" && contest[1] === "conflict")
    || (contest[0] === "already_owned" && contest[1] === "ok"), contest.join(", "));
  assert.equal(await client.run(`
    select count(*) from ironclad_private.caster_applications where owner_clerk_user_id='user_CasterPhase2MixedRace';
  `), "1");
  assert.equal(await client.run(`
    select (claimed_by is not null)::text from ironclad_private.caster_phase1_invitations
      where token_digest=decode(repeat('a',64),'hex');
  `), contest[0] === "claimed" ? "true" : "false");
  console.log("PASS concurrent direct grant and invitation claim share the one-application boundary");
} finally {
  await client.run(`drop database ${database};`, { db: "postgres" });
}
