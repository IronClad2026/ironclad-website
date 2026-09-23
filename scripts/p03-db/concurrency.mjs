import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repositoryRoot } from "./package.mjs";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const psql = localPsqlArgument();
const client = localClient(psql, { database: "p03_candidate" });
assert.equal(await client.run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and (select count(*) from public.players)=0 and (select count(*) from supabase_migrations.schema_migrations)=152;"), "t");
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "p03-concurrency-"));
const evidence = [];
for (const [name, legacyDatabase, legacySource, legacyRole] of [
  ["match-room-phase-1-concurrency", "ironclad_match_room_race_tests", "ironclad_match_room_tests", "ironclad_match_room_race_client"],
  ["match-room-phase-3-concurrency", "ironclad_match_room_phase3_race_tests", "ironclad_match_room_phase3_tests", "ironclad_match_room_phase3_race_client"],
  ["match-room-production-hardening-concurrency", "ironclad_match_room_hardening_race_tests", "ironclad_match_room_phase3_tests", "ironclad_match_room_hardening_race_client"],
]) {
  const sourceFile = path.join(repositoryRoot, "tests/database", name + ".mjs");
  let source = readFileSync(sourceFile, "utf8");
  // Reuse the actual controlled-session assertions against the FINAL candidate.
  // Changes are limited to safe local target/template names, enabling the two
  // pre-kill-switch suites, and omitting the obsolete duplicate initial apply.
  source = source.replaceAll(legacyDatabase, "p03_race_" + name.replaceAll("-", "_"))
    .replaceAll(legacySource, "p03_candidate")
    .replaceAll(legacyRole, "p03_client_" + name.replaceAll("-", "_"))
    .replace('const port = "56591";', 'const port = "56623";')
    .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(sourceFile).href));
  if (name === "match-room-production-hardening-concurrency") {
    assert(source.includes("await run(migration);"));
    source = source.replace("await run(migration);", "// Final candidate package is already applied in the template.");
  } else {
    assert(/createdDatabase\s*=\s*true;/.test(source));
    source = source.replace(/createdDatabase\s*=\s*true;/,
      "createdDatabase = true; await run(\"select public.set_match_room_enabled(true,'match-room-test-4');\");");
  }
  const generated = path.join(temporaryDirectory, name + ".mjs");
  writeFileSync(generated, source);
  const result = spawnSync(process.execPath, [generated, psql], { encoding: "utf8", windowsHide: true, timeout: 180000 });
  console.log(result.stdout);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  evidence.push({ name, assertions: result.stdout.split(/\r?\n/).filter((line) => line.startsWith("PASS ")),
    summary: result.stdout.split(/\r?\n/).find((line) => /^Passed \d+/.test(line)) });
}
writeFileSync(path.join(repositoryRoot, "tests/p03-db/concurrency-evidence.json"), JSON.stringify({
  recordedAt: new Date().toISOString(), postgres: await client.run("show server_version;"), status: "PASS", suites: evidence,
}, null, 2) + "\n");
console.log("P03 CONCURRENCY REHEARSAL: PASS");
