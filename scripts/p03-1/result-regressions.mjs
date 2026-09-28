// Run existing result/replay SQL contracts against the final local P03.1 tree.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const root = process.cwd();
const database = JSON.parse(readFileSync(path.join(root, "scripts/p03-1/database-evidence.json"), "utf8")).database;
assert(/^p03_realtime_\d+$/.test(database));
const client = localClient(localPsqlArgument(), { database });
assert.equal(await client.run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and (select count(*) from public.players)=0;"), "t");
const checks = [];
for (const name of ["match-result-transactional-notifications", "match-result-ux-confirmation"]) {
  const sql = readFileSync(path.join(root, "tests/database", name + ".sql"), "utf8")
    .replaceAll("inet_server_port() = 55462", "inet_server_port() = 56623");
  const output = await client.run(sql);
  const summary = output.split(/\r?\n/).filter((line) => /^PASS:|^p1_match_result/.test(line));
  checks.push({ suite: name, status: "PASS", summary });
  console.log("PASS " + name);
}
writeFileSync(path.join(root, "scripts/p03-1/result-regressions-evidence.json"), JSON.stringify({ testedAt: new Date().toISOString(), status: "PASS", checks }, null, 2) + "\n");
