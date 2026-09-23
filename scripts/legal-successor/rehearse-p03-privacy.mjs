import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localClient, localPsqlArgument } from "../p03-db/local-pg.mjs";
import { buildP03PrivacyPublicationSql } from "./p03-privacy-publication.mjs";

const database = `p03_privacy_${Date.now()}`;
const client = localClient(localPsqlArgument(), { database });
const predecessor = JSON.parse(readFileSync("docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json", "utf8"));
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hashes = predecessor.documents.map((document) => ({ ...document, sha256: createHash("sha256").update(readFileSync(join("public", document.publicPath))).digest("hex") }));
const snapshot = "select jsonb_agg(to_jsonb(document) order by id)::text from public.legal_documents document;";
let count = 0;
const pass = (name) => { count++; console.log(`PASS ${name}`); };
const sql = buildP03PrivacyPublicationSql({ predecessor, date, sha256: "a".repeat(64) });
try {
  await client.run(`create database ${database};`, { db: "postgres" });
  await client.run(`create table public.platform_settings(key text primary key,value jsonb not null);
    insert into public.platform_settings values('match_room','{"enabled":false}');
    create table public.legal_documents(id uuid primary key default gen_random_uuid(),document_kind text not null,version text not null,
      immutable_url text not null,status text not null,published_at timestamptz not null,effective_at timestamptz not null,sha256 text not null,created_at timestamptz not null default now(),unique(document_kind,version));
    create table public.registration_acceptances(id integer primary key,evidence text); insert into public.registration_acceptances values(1,'preserve');
    create table public.account_legal_acceptances(id integer primary key,evidence text); insert into public.account_legal_acceptances values(1,'preserve');
    insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256) values
    ${hashes.map((document) => `(${literal(document.kind)},${literal(document.version)},${literal("https://www.ironcladtournaments.com" + document.publicPath)},'effective',now(),now(),${literal(document.sha256)})`).join(",")},
    ('privacy','1.0','https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf','superseded',now(),now(),'historical');`);
  const before = await client.run(snapshot);
  await client.run(sql);
  assert.equal(await client.run(snapshot), before);
  pass("default publication SQL rolls back all legal mutations");
  const paused = client.start(sql.replace(/rollback;\s*$/, "\\echo P03_PUBLICATION_PAUSED"), { interactive: true });
  const waitingUntil = Date.now() + 10000;
  while (!paused.stdout.includes("P03_PUBLICATION_PAUSED")) {
    assert(Date.now() < waitingUntil, paused.stderr || "Publication did not pause");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const racedOn = await client.start("update public.platform_settings set value='{\"enabled\":true}' where key='match_room';").done;
  assert.notEqual(racedOn.code, 0); assert.match(racedOn.stderr, /55P03/);
  assert.equal(await client.run("select value from public.platform_settings where key='match_room';"), '{"enabled": false}');
  paused.child.stdin.end("rollback;\n");
  const rolledBack = await paused.done; assert.equal(rolledBack.code, 0, rolledBack.stderr);
  assert.equal(await client.run(snapshot), before);
  pass("concurrent ON update cannot pass publication's held OFF row lock");
  const rejected = async (statement, message) => {
    const result = await client.start(statement).done;
    assert.notEqual(result.code, 0); assert.match(result.stderr, message);
  };
  await client.run("update public.platform_settings set value='{\"enabled\":true}' where key='match_room';");
  await rejected(sql, /must remain OFF/);
  assert.equal(await client.run(snapshot), before);
  await client.run("update public.platform_settings set value='{\"enabled\":false}' where key='match_room';");
  pass("enabled communication prevents legal activation");
  await rejected(buildP03PrivacyPublicationSql({ predecessor, date: "2000-01-01", sha256: "a".repeat(64) }), /actual Australia\/Sydney date/);
  pass("stale date is rejected");
  await client.run("update public.legal_documents set sha256='changed' where document_kind='terms';");
  await rejected(sql, /predecessors/);
  await client.run(`update public.legal_documents set sha256=${literal(hashes.find((document) => document.kind === "terms").sha256)} where document_kind='terms';`);
  assert.equal(await client.run(snapshot), before);
  pass("changed effective predecessor is rejected without repair");
  const unchanged = await client.run("select jsonb_agg(to_jsonb(document) order by id)::text from public.legal_documents document where document_kind <> 'privacy' or version <> '1.2';");
  await client.run(buildP03PrivacyPublicationSql({ predecessor, date, sha256: "a".repeat(64), apply: true }));
  assert.equal(await client.run("select count(*) from public.legal_documents where status='effective';"), "4");
  assert.equal(await client.run("select count(*) from public.legal_documents where document_kind='privacy' and version='1.3' and status='effective';"), "1");
  assert.equal(await client.run("select jsonb_agg(to_jsonb(document) order by id)::text from public.legal_documents document where not (document_kind='privacy' and version in ('1.2','1.3'));"), unchanged);
  assert.deepEqual((await client.run("select evidence from public.registration_acceptances union all select evidence from public.account_legal_acceptances;")).split(/\r?\n/), ["preserve", "preserve"]);
  pass("explicit local application changes Privacy only and preserves immutable acceptance/history");
  await rejected(sql, /predecessors/);
  pass("already-applied successor stops instead of guessing or duplicating");
  console.log(JSON.stringify({ status: "PASS", checks: count, database, productionConnected: false }));
} finally {
  for (const request of client.processes) request.child.kill();
}
