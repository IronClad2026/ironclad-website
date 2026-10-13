// Transactional regression on the attested synthetic loopback rehearsal only.
// No application environment, remote connection, Production row or credential.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connect, scalar } from "./local-client.mjs";
import { assertStructure, compareStructure } from "./structure.mjs";
import { CHECKS, HISTORICAL_CHECK_CONSTRAINTS, historicalConstraintInventorySql } from "../consolidated-release/sql.mjs";

export async function checkHistoricalConstraintInventory(client) {
  assert.equal(await scalar(client, "select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal'"), true, "Requires the attested synthetic loopback database");
  assert.equal(await scalar(client, "select count(*)::integer from public.players where clerk_user_id not like 'local-consolidated-%'"), 0, "Non-synthetic identity found; constraint regression refused");
  await assertStructure(client);
  const steps = [];
  const inventory = async (phase = "before-schema") => Number(await scalar(client, historicalConstraintInventorySql(phase)));
  const transaction = async (name, sql, verify) => {
    await client.query("begin");
    try {
      await client.query(sql);
      await verify();
      steps.push(name);
    } finally { await client.query("rollback"); }
    assert.equal(await inventory(), 0, "Constraint regression rollback did not preserve inventory");
    await assertStructure(client);
  };
  assert.equal(Number(await scalar(client, CHECKS.historicConstraintInventoryMismatch)), 0, "Unchanged genuine baseline constraint inventory must pass");
  const names = HISTORICAL_CHECK_CONSTRAINTS.map((check) => check.name);
  const renderings = (await client.query("select conname,pg_get_constraintdef(oid,false) as plain,pg_get_constraintdef(oid,true) as pretty from pg_constraint where conrelid='public.tournaments'::regclass and conname=any($1::text[]) order by conname", [names])).rows;
  assert.equal(renderings.length, 5);
  for (const row of renderings) {
    assert.notEqual(row.plain, row.pretty, "Exercise the actual default/pretty rendering difference");
    assert.equal(row.pretty, HISTORICAL_CHECK_CONSTRAINTS.find((check) => check.name === row.conname).definition);
  }
  steps.push("All five actual non-pretty/pretty renderings differ while unchanged baseline inventory passes");
  const original = renderings.find((row) => row.conname === "tournaments_end_after_start").plain;
  await transaction("Same-server non-pretty reconstructed equivalent CHECK passes", `alter table public.tournaments drop constraint tournaments_end_after_start; alter table public.tournaments add constraint tournaments_end_after_start ${original};`, async () => assert.equal(await inventory(), 0));
  await transaction("Redundant source parentheses and whitespace preserve equivalent CHECK", "alter table public.tournaments drop constraint tournaments_end_after_start; alter table public.tournaments add constraint tournaments_end_after_start CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))) NOT VALID", async () => assert.equal(await inventory(), 0));
  const rejects = [
    ["Changed comparison operator fails", "alter table public.tournaments drop constraint tournaments_end_after_start; alter table public.tournaments add constraint tournaments_end_after_start CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date) NOT VALID"],
    ["Changed boolean grouping fails", "alter table public.tournaments drop constraint tournaments_end_after_start; alter table public.tournaments add constraint tournaments_end_after_start CHECK (end_date IS NULL OR (start_date IS NULL AND end_date >= start_date)) NOT VALID"],
    ["Changed literal fails", "alter table public.tournaments drop constraint tournaments_slug_format; alter table public.tournaments add constraint tournaments_slug_format CHECK (slug ~ '^[a-z0-9]+$'::text) NOT VALID"],
    ["Removed CHECK fails", "alter table public.tournaments drop constraint tournaments_end_after_start"],
    ["Renamed CHECK identity fails", "alter table public.tournaments rename constraint tournaments_end_after_start to regression_renamed_end_after_start"],
    ["Validated historical CHECK fails", "alter table public.tournaments validate constraint tournaments_end_after_start"],
    ["Wrong constraint type under the expected name fails", "alter table public.tournaments drop constraint tournaments_end_after_start; alter table public.tournaments add constraint tournaments_end_after_start FOREIGN KEY (id) REFERENCES public.tournaments(id) NOT VALID"],
    ["Unexpected NOT VALID CHECK fails", "alter table public.tournaments add constraint regression_unexpected_check CHECK (true) NOT VALID"],
    ["Unexpected validated CHECK fails", "alter table public.tournaments add constraint regression_unexpected_check CHECK (true)"],
  ];
  for (const [name, sql] of rejects) await transaction(name, sql, async () => assert((await inventory()) > 0, name));
  await transaction("Reviewed future CHECK is accepted only after the schema boundary", "alter table public.tournaments add column division_model_version text not null default 'legacy_three_v1' constraint tournaments_division_model_version_check CHECK (division_model_version in ('legacy_three_v1','four_division_v1'))", async () => {
    assert((await inventory()) > 0);
    assert.equal(await inventory("after-schema"), 0);
    assert.equal(await inventory("after-activation"), 0);
  });
  const catalogRejects = [
    ["Changed table owner remains visible to exact catalog comparison", "alter table public.tournaments owner to anon", "relations"],
    ["Changed grant option remains visible to exact catalog comparison", "grant select on public.tournaments to anon with grant option", "relations"],
    ["Changed column schema remains visible to exact catalog comparison", "alter table public.tournaments add column regression_unexpected_column integer", "columns"],
  ];
  for (const [name, sql, category] of catalogRejects) await transaction(name, sql, async () => assert.equal((await compareStructure(client))[category].exact, false, name));
  return steps;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = await connect();
  try {
    const steps = await checkHistoricalConstraintInventory(client);
    console.log(JSON.stringify({ status: "PASS", scope: "isolated synthetic historical constraint inventory regression", steps, productionRead: false, productionMutated: false }));
  } finally { await client.end(); }
}
