import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const root = process.cwd();
const database = JSON.parse(readFileSync(path.join(root, "scripts/p03-1/database-evidence.json"), "utf8")).database;
assert(/^p03_realtime_\d+$/.test(database));
const client = localClient(localPsqlArgument(), { database });
assert.equal(await client.run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623;"), "t");
const fingerprint = `select jsonb_build_object('gate',public.get_match_room_enabled(),
  'functions',(select md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','ironclad_private') and p.proname like '%match_room%'),
  'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='realtime'),
  'messages',(select count(*) from public.match_messages),'rooms',(select count(*) from public.match_rooms));`;
const before = await client.run(fingerprint);
const checks = [];
for (const suffix of ["_match_room_staging_foundation.sql", "_match_room_private_realtime.sql"]) {
  const files = readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(suffix));
  assert.equal(files.length, 1);
  const repeated = await client.start(readFileSync(path.join(root, "supabase/migrations", files[0]), "utf8")).done;
  assert.notEqual(repeated.code, 0);
  assert.match(repeated.stderr, /42P07|42723/);
  assert.equal(await client.run(fingerprint), before);
  const name = suffix + " rejects accidental replay atomically, preserving enabled state, policies and definitions";
  checks.push(name); console.log("PASS " + name);
}
writeFileSync(path.join(root, "scripts/p03-1/repeatability-evidence.json"), JSON.stringify({ testedAt: new Date().toISOString(), status: "PASS", checks }, null, 2) + "\n");
