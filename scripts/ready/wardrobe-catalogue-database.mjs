import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localClient, localPsqlArgument } from "../p03-1/local-pg.mjs";

const client = localClient(localPsqlArgument(), { database: "p03_wardrobe_" + Date.now() });
const trustedTarget = await client.run(
  "select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=" + client.port,
  { db: "postgres" },
);
assert.equal(trustedTarget, "t");
await client.run("create database " + client.database, { db: "postgres" });
const paths = [
  "tests/database/local-supabase-replay-prelude.sql",
  "supabase/migrations/20261122055154_ready_wardrobe_pilot.sql",
  "supabase/migrations/20261122060436_ready_wardrobe_pilot_verified_stack.sql",
  "supabase/migrations/20261124090000_ready_wardrobe_catalogue.sql",
  "tests/database/ready-wardrobe-pilot.sql",
];
for (const path of paths) {
  const result = await client.run(await readFile(path, "utf8"));
  console.log(result || "PASS " + path);
}
