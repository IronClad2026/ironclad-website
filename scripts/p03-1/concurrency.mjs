// Reuse controlled-session regressions against the fully migrated P03.1 tree.
// Only local target names, template, and obsolete initial migration application
// are adapted. Original tests and all their behavioral assertions stay intact.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const root = process.cwd();
const psql = localPsqlArgument();
const template = JSON.parse(readFileSync(path.join(root, "scripts/p03-1/database-evidence.json"), "utf8")).database;
assert(/^p03_realtime_\d+$/.test(template));
const client = localClient(psql, { database: template });
assert.equal(await client.run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port} and (select count(*) from public.players)=0;`), "t");
const directory = mkdtempSync(path.join(tmpdir(), "p031-concurrency-"));
const suites = [];
for (const [name, legacyDatabase, legacyTemplate, legacyRole] of [
  ["match-room-phase-1-concurrency", "ironclad_match_room_race_tests", "ironclad_match_room_tests", "ironclad_match_room_race_client"],
  ["match-room-phase-3-concurrency", "ironclad_match_room_phase3_race_tests", "ironclad_match_room_phase3_tests", "ironclad_match_room_phase3_race_client"],
  ["match-room-production-hardening-concurrency", "ironclad_match_room_hardening_race_tests", "ironclad_match_room_phase3_tests", "ironclad_match_room_hardening_race_client"],
  ["match-room-unread-concurrency", "ironclad_match_room_unread_race_tests", "ironclad_match_room_hardening_tests", "ironclad_match_room_unread_race_client"],
]) {
  const file = path.join(root, "tests/database", name + ".mjs");
  let source = readFileSync(file, "utf8").replaceAll(legacyDatabase, "p03_race_" + name.replaceAll("-", "_"))
    .replaceAll(legacyTemplate, template).replaceAll(legacyRole, "p03_client_" + name.replaceAll("-", "_"))
    .replace('const port = "56591";', `const port = "${client.port}";`)
    .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(file).href));
  if (name === "match-room-production-hardening-concurrency") {
    assert(source.includes("await run(migration);"));
    source = source.replace("await run(migration);", "await run(\"select public.set_match_room_enabled(false,'match-room-test-4');\"); // Full template already has hardening; restore tested default.");
  } else if (name === "match-room-unread-concurrency") {
    assert(source.includes('await run(readFileSync(new URL(migrationName, migrationDirectory), "utf8"));'));
    source = source.replace('await run(readFileSync(new URL(migrationName, migrationDirectory), "utf8"));', "// Full template already has unread summary.");
  }
  const generated = path.join(directory, name + ".mjs");
  writeFileSync(generated, source);
  const result = spawnSync(process.execPath, [generated, psql], { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  console.log(result.stdout);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  suites.push({ name, summary: result.stdout.split(/\r?\n/).find((line) => /^Passed \d+/.test(line)),
    checks: result.stdout.split(/\r?\n/).filter((line) => line.startsWith("PASS ")) });
}
writeFileSync(path.join(root, "scripts/p03-1/concurrency-evidence.json"), JSON.stringify({ testedAt: new Date().toISOString(), status: "PASS", suites }, null, 2) + "\n");
