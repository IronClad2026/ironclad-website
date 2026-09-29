// Local PostgreSQL rehearsal only; clone the populated lifecycle fixture DB.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildFourDivisionLegalSql, validateFourDivisionLegalRelease, STAGING_PROJECT_REF, STAGING_LEGAL_STORAGE_ORIGIN } from "../../scripts/four-division/legal-publication.mjs";

const [psql, port, database] = process.argv.slice(2);
assert.equal(process.argv.length, 5);
assert(/^\d{2,5}$/.test(port) && Number(port) <= 65535);
assert(/^p03_four_division_legal_\d+$/.test(database));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const config = { projectRef: STAGING_PROJECT_REF, origin: STAGING_LEGAL_STORAGE_ORIGIN };
function run(sql, fail = false) {
  const result = spawnSync(psql, ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database], {
    input: sql, encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, PGCONNECT_TIMEOUT: "5" },
  });
  if (fail) { assert.notEqual(result.status, 0); return result.stderr; }
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const tables = ["legal_documents", "registration_acceptances", "account_legal_acceptances", "tournaments", "registrations", "tournament_matches", "leaderboard_seasons", "leaderboard_point_events", "leaderboard_player_season_stats", "leaderboard_player_all_time_stats", "leaderboard_season_champions"];
const digest = (table) => `(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.${table} r)`;
const snapshot = () => JSON.parse(run(`select jsonb_build_object(${tables.map((table) => `${quote(table)},${digest(table)}`).join(",")});`));
assert.equal(run("select count(*) from public.legal_documents;"), "0");
assert(Number(run("select count(*) from public.leaderboard_season_champions;")) > 0, "Clone the populated lifecycle rehearsal");
const previous = JSON.parse(readFileSync("content/legal-history/rulebook-ppa-v3.1-corpus.json", "utf8"));
const originals = previous.documents.map((document) => ({ kind: document.kind, version: document.version, sha256: hash(readFileSync(resolve("public", `.${document.publicPath}`))) }));
const archives = [["rulebook", "3.0"], ["ppa", "3.0"], ["terms", "1.0"], ["privacy", "1.0"], ["privacy", "1.1"]].map(([kind, version]) => ({ kind, version, sha256: hash(`local historical ${kind} ${version}`) }));
const documents = [...originals.map((document) => ({ ...document, status: "effective" })), ...archives.map((document) => ({ ...document, status: "superseded" }))];
run(`begin; set local session_replication_role=replica;
insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
values ${documents.map((d) => `(${quote(d.kind)},${quote(d.version)},${quote(`https://legal-rehearsal.example/${d.kind}-${d.version}.pdf`)},${quote(d.status)},'2026-09-01','2026-09-01',${quote(d.sha256)})`).join(",")};
insert into public.account_legal_acceptances(clerk_user_id,terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,terms_accepted,privacy_acknowledged)
select 'local-legal-account',t.id,t.version,t.immutable_url,t.sha256,p.id,p.version,p.immutable_url,p.sha256,true,true
from public.legal_documents t cross join public.legal_documents p where t.document_kind='terms' and p.document_kind='privacy' and t.status='effective' and p.status='effective';
insert into public.registration_acceptances(registration_id,tournament_id,clerk_user_id,rulebook_document_id,rulebook_version,rulebook_url,rulebook_sha256,ppa_document_id,ppa_version,ppa_url,ppa_sha256,terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,rulebook_accepted,ppa_accepted,terms_accepted,privacy_acknowledged,age_18_confirmed,own_ironclad_account_confirmed,linked_steam_account_confirmed)
select r.id,r.tournament_id,r.clerk_user_id,b.id,b.version,b.immutable_url,b.sha256,a.id,a.version,a.immutable_url,a.sha256,t.id,t.version,t.immutable_url,t.sha256,p.id,p.version,p.immutable_url,p.sha256,true,true,true,true,true,true,true
from (select * from public.registrations order by id limit 3) r cross join public.legal_documents b cross join public.legal_documents a cross join public.legal_documents t cross join public.legal_documents p
where b.document_kind='rulebook' and a.document_kind='ppa' and t.document_kind='terms' and p.document_kind='privacy' and b.status='effective' and a.status='effective' and t.status='effective' and p.status='effective';
insert into public.leaderboard_seasons select (jsonb_populate_record(null::public.leaderboard_seasons,to_jsonb(s)||jsonb_build_object('id',md5('legal-rehearsal-legacy-season')::uuid,'name','Frozen legacy Main / Pro fixture','year',2025,'season_number',1,'official_bracket_type','main','is_active',false))).* from public.leaderboard_seasons s where s.finalized_at is not null limit 1;
insert into public.leaderboard_player_season_stats select (jsonb_populate_record(null::public.leaderboard_player_season_stats,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'season_id',md5('legal-rehearsal-legacy-season')::uuid,'bracket_type','main'))).* from public.leaderboard_player_season_stats p join public.leaderboard_seasons s on s.id=p.season_id where s.finalized_at is not null and p.bracket_type='pro';
insert into public.leaderboard_season_champions select (jsonb_populate_record(null::public.leaderboard_season_champions,to_jsonb(c)||jsonb_build_object('id',gen_random_uuid(),'season_id',md5('legal-rehearsal-legacy-season')::uuid,'bracket_type','main'))).* from public.leaderboard_season_champions c where c.bracket_type='pro';
commit;`);

const initial = snapshot();
const release = validateFourDivisionLegalRelease();
run(buildFourDivisionLegalSql(config));
assert.deepEqual(snapshot(), initial, "Default rollback rehearsal changed protected data");
const drift = run("begin; insert into public.legal_documents(document_kind,version,immutable_url,status) values('rulebook','drift','https://legal-rehearsal.example/drift','review_draft');" + buildFourDivisionLegalSql(config), true);
assert.match(drift, /predecessor register changed/);
assert.deepEqual(snapshot(), initial, "Rejected register drift escaped rollback");
assert.throws(() => buildFourDivisionLegalSql({ ...config, projectRef: "wrong-project" }));
assert.throws(() => buildFourDivisionLegalSql({ ...config, origin: "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app" }));
run(buildFourDivisionLegalSql({ ...config, apply: true }));
const applied = snapshot();
for (const table of tables.filter((name) => name !== "legal_documents")) assert.equal(applied[table], initial[table], `${table} changed during publication`);
const counts = JSON.parse(run(`select jsonb_build_object('documents',(select count(*) from legal_documents),'effective',(select count(*) from legal_documents where status='effective'),'successors',(select count(*) from legal_documents where version='3.2' and status='effective'),'supersededPredecessors',(select count(*) from legal_documents where document_kind in ('rulebook','ppa') and version='3.1' and status='superseded'),'registrationAcceptances',(select count(*) from registration_acceptances),'accountAcceptances',(select count(*) from account_legal_acceptances),'legacyChampionRows',(select count(*) from leaderboard_season_champions where bracket_type='main'));`));
assert.equal(counts.documents, 11); assert.equal(counts.effective, 4); assert.equal(counts.successors, 2); assert.equal(counts.supersededPredecessors, 2);
assert.equal(counts.registrationAcceptances, 3); assert.equal(counts.accountAcceptances, 1); assert(counts.legacyChampionRows > 0);
assert.match(run(buildFourDivisionLegalSql({ ...config, apply: true }), true), /predecessor register changed/);
assert.deepEqual(snapshot(), applied, "Rejected repeat publication changed evidence");
assert.equal(validateFourDivisionLegalRelease().documents[0].sha256, release.documents[0].sha256);
const evidence = { timestamp: new Date().toISOString(), scope: "isolated-loopback-postgresql", database, publicationManifestHash: hash(readFileSync("content/four-division-legal-release.json")), generatedSqlHash: hash(buildFourDivisionLegalSql({ ...config, apply: true })), rollback: "all register/acceptance/history digests equal", apply: "only successor publication and predecessor status changes", repeatApply: "rejected atomically", staleRegister: "rejected atomically", projectAndMutableOriginGuards: "rejected", protectedTableDigestsPreserved: tables.length - 1, counts, liveWrites: 0, productionTouched: false };
mkdirSync("test-results/four-division", { recursive: true });
writeFileSync("test-results/four-division/legal-publication-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
