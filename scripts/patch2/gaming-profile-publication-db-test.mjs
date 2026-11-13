import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = resolve(root, "../release-execution-tools");
const bin = resolve(tools, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(tools, "pg-client/node_modules/pg"));
const osKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS",
  "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME"]);
// Restart only this script with clean process state. The child verifies that
// no project credentials or optional Node hooks reached the database runner.
if (!process.execArgv.some(argument => argument.endsWith("block-remote-network.cjs"))) {
  const child = spawnSync(process.execPath, ["--require", resolve(root, "scripts/patch2/block-remote-network.cjs"), fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => osKeys.has(key.toUpperCase()))),
    cwd: root, windowsHide: true, stdio: "inherit",
  });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
assert.ok(Object.keys(process.env).every(key => osKeys.has(key.toUpperCase())), "Requires an OS-only environment");
assert.match(net.Socket.prototype.connect.toString(), /checkConnect/, "Requires the loopback-only network preload");

const host = "127.0.0.1";
const port = 56746;
const run = resolve(root, ".release-local", `gaming-profile-publication-run-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "init-password");
const password = randomBytes(32).toString("base64url");
const connect = (database = "postgres") => new Client({ host, port, database, user: "postgres", password, connectionTimeoutMillis: 1000, statement_timeout: 15000 });
const files = {
  baseline: "20261027181708_public_competitive_profile_read_projections.sql",
  highlights: "20261001032957_production_combat_highlights_authority.sql",
  acceptance: "20260908052210_member_rpc_current_account_acceptance.sql",
  closure: "20261113010000_patch2_durable_account_closure.sql",
  migration: "20261113110000_patch2_gaming_profile_publication.sql",
};
const baselineOnly = process.argv.length === 3 && process.argv[2] === "--baseline-only";
assert.ok(baselineOnly || process.argv.length === 2, "Use --baseline-only to verify the fixture without the transition migration");
const sqlFile = async name => (await readFile(resolve(root, "supabase/migrations", name), "utf8")).replaceAll("\r\n", "\n");
const report = { target: `${host}:${port} disposable PostgreSQL`, files, checks: [], limitations: [
  "Synthetic rows and simulated local JWT claims only. No hosted API, Clerk, browser, Worker, or Storage byte test.",
  "Dependency table shapes are local fixtures. Public views and highlight and legal guard functions come from exact checked-in sources.",
] };
const clients = [];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const player = n => `user_profile_fixture_${n}`;
const names = {
  oldOff: 1, oldOn: 2, documented: 3, closed: 4, objected: 5,
  prospect: 6, wrongDocs: 7, noReceipt: 8, untrusted: 9, marker: 10, wrongDigest: 11, inFlight: 12,
};
const projectionNames = ["public_player_profiles", "public_player_showcases", "leaderboard_public_all_time_standings", "leaderboard_public_season_standings", "leaderboard_public_season_champions"];

async function first(db, sql, parameters = []) {
  const { rows } = await db.query(sql, parameters);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function actor(db, role, n) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role, sub: n ? player(n) : undefined })]);
  if (role !== "postgres") await db.query(`set role ${role}`);
}

async function check(shape, name, execute) {
  await execute();
  report.checks.push({ shape, name });
}

function extract(source, expression, name) {
  const matches = [...source.matchAll(expression)].map(match => match[0]);
  assert.ok(matches.length > 0, `Missing checked-in ${name}`);
  return matches;
}

function installBaseline(db, shape, baseline, highlights, acceptance, closure) {
  const views = projectionNames.map(name => {
    const options = extract(baseline, new RegExp(`^create or replace view public\\.${name}\\b[\\s\\S]*?;`, "gmi"), name);
    assert.equal(options.length, ["leaderboard_public_season_standings", "leaderboard_public_season_champions"].includes(name) ? 2 : 1);
    return options[options.length === 2 && shape === "unbridged" ? 1 : 0];
  });
  const privateState = extract(baseline, /^create or replace function ironclad_private\.combat_highlight_state\([\s\S]*?\$function\$\s*;/gmi, "highlight owner state")[0];
  const canRead = extract(baseline, /^create or replace function public\.can_read_public_player_combat_highlight\([\s\S]*?\$function\$\s*;/gmi, "highlight media authority")[0];
  const list = extract(highlights, /^create function public\.get_public_player_combat_highlights\([\s\S]*?\$\$;/gmi, "highlight list")[0];
  const guard = extract(acceptance, /^create or replace function ironclad_private\.require_current_account_legal_acceptance\([\s\S]*?\$\$;/gmi, "current document guard")[0];
  const closureGuard = extract(closure, /^create function ironclad_private\.reject_closed_player_identity\([\s\S]*?\$\$;/gmi, "closed identity insertion guard")[0];
  const closureTrigger = extract(closure, /^create trigger players_reject_closed_identity[\s\S]*?;/gmi, "closed identity insertion trigger")[0];
  const bridge = shape === "production-bridge" ? `
    create table ironclad_private.legacy_main_pro_season_transition(season_id uuid, tournament_id uuid, activated_at timestamptz);
    create table ironclad_private.synthetic_official_standings (like public.leaderboard_player_season_stats);
    create view ironclad_private.leaderboard_official_season_standings as select * from ironclad_private.synthetic_official_standings;
  ` : "";
  return db.query(`set search_path=public,pg_catalog; ${bridge} ${views.join("\n")} ${privateState} ${canRead} ${list} ${guard} ${closureGuard} ${closureTrigger}
    grant select on ${projectionNames.map(name => `public.${name}`).join(", ")} to anon, authenticated, service_role;
    revoke all on function ironclad_private.combat_highlight_state(uuid) from public;
    revoke all on function ironclad_private.require_current_account_legal_acceptance() from public;
    revoke all on function public.can_read_public_player_combat_highlight(uuid), public.get_public_player_combat_highlights(uuid) from public;
    grant execute on function public.can_read_public_player_combat_highlight(uuid), public.get_public_player_combat_highlights(uuid) to anon, authenticated, service_role;
  `);
}

async function createPlayer(db, n, { saved = false, closed = false, discord = true, upsert = false } = {}) {
  await db.query(`insert into public.players (id, clerk_user_id, display_name, in_game_name, country, region, current_elo,
    avatar_url, public_profile_enabled, discord_public_enabled, discord_username, account_closed_at, coh3_profile_id)
    values($1,$2,$3,$4,'AU','OCE',1550,'fixture/avatar',$5,$6,'fixture-discord',case when $7 then clock_timestamp() end,$8)
    ${upsert ? "on conflict (clerk_user_id) do update set in_game_name=excluded.in_game_name" : ""}`,
  [id(n), player(n), `optional-display-${n}`, `competition-alias-${n}`, saved, discord, closed, String(n + 900)]);
}

async function seedPredecessor(db, shape) {
  for (const n of [names.oldOff, names.oldOn, names.documented, names.closed, names.objected]) {
    await createPlayer(db, n, { saved: n !== names.oldOff, closed: n === names.closed, discord: n !== names.documented });
    await db.query("insert into public.player_showcases values($1,'fixture-showcase',null,null)", [id(n)]);
    await db.query(`insert into ironclad_private.player_combat_highlight_uploads values($1,$2,1,'ready',
      '{"durationMs":100,"width":640,"height":480,"fps":30,"hasPoster":true}','fixture-highlight','video/mp4');`, [id(n + 100), id(n)]);
    await db.query("insert into public.player_combat_highlight_slots values($1,1,1,1,null,$2,null)", [id(n), id(n + 100)]);
  }
  await db.query(`insert into public.leaderboard_seasons values($1,'Fixture Season',2026,1,'2026-01-01','2026-03-01');`, [id(500)]);
  await db.query("insert into public.tournaments(id,title) values($1,'Fixture tournament')", [id(501)]);
  await db.query("insert into public.tournaments(id,title) values($1,'Other fixture tournament')", [id(503)]);
  await db.query(`insert into public.registrations(id,profile_id,tournament_id,player_name,registration_status,created_at) values
    ($1,$2,$3,'Official event alias','approved',now()-interval '2 days'),
    ($4,$2,$5,'Later official alias','approved',now()-interval '1 day'),
    ($6,$2,$5,'Hidden pending alias','pending',now()),
    ($7,$8,$3,'Closed historic alias','approved',now()),
    ($9,$10,$3,'Objected event alias','approved',now())`,
  [id(510), id(names.oldOff), id(501), id(511), id(503), id(512), id(513), id(names.closed), id(514), id(names.objected)]);
  await db.query(`insert into public.leaderboard_player_all_time_stats
    select id,'pro',100+current_elo,1,2,1,4,3,1,75,1,$1,now() from public.players;`, [id(500)]);
  await db.query(`insert into public.leaderboard_player_season_stats
    select $1,id,'pro',11,1,2,1,4,3,1,75,$2,11,row_number() over(order by id),null,0,now() from public.players`, [id(500), id(501)]);
  await db.query(`insert into public.leaderboard_season_champions
    select id,$1,id,'pro',1,11,now() from public.players`, [id(500)]);
  if (shape === "production-bridge") {
    await db.query("insert into ironclad_private.legacy_main_pro_season_transition values($1,$2,now())", [id(500), id(501)]);
    await db.query("insert into ironclad_private.synthetic_official_standings select * from public.leaderboard_player_season_stats");
    await db.query("update ironclad_private.synthetic_official_standings set total_points=37, last_tournament_points=37");
  }
}

const visibleIds = async db => (await db.query("select id from public.public_player_profiles order by id")).rows.map(row => row.id);
const profile = (db, n) => first(db, "select * from public.public_player_profiles where id=$1", [id(n)]);
const state = async db => (await first(db, "select public.get_my_gaming_profile_publication() result")).result;
const setPublication = async (db, enabled, revision) => (await first(db, "select public.set_my_legacy_gaming_profile_publication($1,$2) result", [enabled, revision])).result;
const avatar = async (db, n, viewer = null) => (await first(db, "select public.get_gaming_profile_avatar_target($1,$2) result", [id(n), viewer ? player(viewer) : null])).result;
const activate = db => db.query("select ironclad_private.activate_gaming_profile_publication()");
const highlight = async (db, n) => (await first(db, "select public.can_read_public_player_combat_highlight($1) result", [id(n + 100)])).result;
const review = async (db, n, revision, action) => (await first(db,
  "select ironclad_private.record_gaming_profile_publication_review($1,$2,$3,'fixture-owner-verification') result", [id(n), revision, action])).result;

async function versions(db) {
  await db.query(`insert into public.legal_documents
    (id,document_kind,version,status,canonical_url,url,sha256,published_at,effective_at) values
    ($1,'terms','1.2','effective','https://fixture.invalid/terms','https://fixture.invalid/terms',repeat('a',64),now()-interval '2 days',now()-interval '1 day'),
    ($2,'privacy','1.4','effective','https://fixture.invalid/privacy','https://fixture.invalid/privacy',repeat('b',64),now()-interval '2 days',now()-interval '1 day'),
    ($3,'terms','1.1','superseded','https://fixture.invalid/terms-old','https://fixture.invalid/terms-old',repeat('c',64),now()-interval '5 days',now()-interval '4 days'),
    ($4,'privacy','1.3','superseded','https://fixture.invalid/privacy-old','https://fixture.invalid/privacy-old',repeat('d',64),now()-interval '5 days',now()-interval '4 days')`,
  [id(600), id(601), id(602), id(603)]);
}

function acceptanceReceipt(db, n, current) {
  return db.query(`insert into public.account_legal_acceptances
    (clerk_user_id,terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,
      privacy_url,privacy_sha256,terms_accepted,privacy_acknowledged)
    select $1,t.id,t.version,t.url,t.sha256,p.id,p.version,p.url,p.sha256,true,true
    from public.legal_documents t cross join public.legal_documents p where t.id=$2 and p.id=$3`,
  [player(n), id(current ? 600 : 602), id(current ? 601 : 603)]);
}

async function catalog(db) {
  return (await db.query(`select c.relname, c.oid::text, c.relowner::text, c.relacl::text, c.reloptions,
    (select jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attacl::text) order by attnum)
      from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped) columns
    from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any($1) order by c.relname`, [projectionNames])).rows;
}

async function exercise(db, shape, migration, database) {
  const { oldOff, oldOn, documented, closed, objected, prospect, wrongDocs, noReceipt, untrusted, marker, wrongDigest, inFlight } = names;
  const priorCatalog = await catalog(db);
  const before = (await db.query("select id,public_profile_enabled,discord_public_enabled from public.players order by id")).rows;
  const factual = (await db.query(`select season_id,season_name,current_rank,total_points,matches_played,last_tournament_id,last_tournament_title
    from public.leaderboard_public_season_standings order by current_rank`)).rows;
  await db.query(migration);
  await check(shape, "pre-activation public surfaces and catalog compatibility", async () => {
    assert.deepEqual(await catalog(db), priorCatalog);
    assert.deepEqual((await db.query("select id,public_profile_enabled,discord_public_enabled from public.players order by id")).rows, before);
    await actor(db, "anon");
    assert.deepEqual(await visibleIds(db), [oldOff, oldOn, documented, objected].map(id));
    assert.equal(await highlight(db, oldOff), true);
    assert.equal(await highlight(db, closed), false);
    await assert.rejects(avatar(db, oldOff), { code: "42501" });
    await assert.rejects(db.query("select * from public.players"), { code: "42501" });
    await actor(db, "service_role");
    assert.ok(await avatar(db, oldOff));
    const unchanged = await first(db, "select in_game_name,display_name,coh3_profile_id,profile_public from public.gaming_profile_disclosure where clerk_user_id=$1", [player(oldOff)]);
    assert.deepEqual(unchanged, { in_game_name: "competition-alias-1", display_name: "optional-display-1", coh3_profile_id: "901", profile_public: true });
    await actor(db, "postgres");
    await assert.rejects(activate(db), { code: "55000" });
    await assert.rejects(db.query(`insert into public.platform_settings values('public_gaming_profile_notice','{"enabled":true,"version":"public-gaming-profile-v2"}')`), { code: "55000" });
  });

  await versions(db);
  await check(shape, "activation refuses while HOLD THE LINE is in progress", async () => {
    await db.query("insert into public.tournaments(id,title,status,slug) values($1,'Fixture renamed tournament','in_progress','hold-the-line')", [id(502)]);
    await assert.rejects(activate(db), { code: "55000" });
    await db.query("update public.tournaments set status='completed', ends_at=clock_timestamp() where id=$1", [id(502)]);
  });
  await check(shape, "profile insert waits for activation and rechecks the committed policy", async () => {
    const writer = connect(database);
    await writer.connect();
    clients.push(writer);
    const { pid } = await first(writer, "select pg_backend_pid() pid");
    await db.query("grant insert on public.players to authenticated");
    await actor(writer, "authenticated", inFlight);
    await db.query("begin");
    await activate(db);
    const write = createPlayer(writer, inFlight).then(() => null, error => error);
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 40; attempt++) {
        const { waiting } = await first(db, "select pg_backend_pid() = any(pg_blocking_pids($1)) waiting", [pid]);
        if (waiting) { blocked = true; break; }
        await wait(25);
      }
    } finally {
      await db.query("commit");
    }
    assert.equal(blocked, true, "The first-profile insert did not take the policy row lock");
    assert.equal((await write)?.code, "42501");
    assert.equal((await first(db, "select count(*)::int value from public.players where id=$1", [id(inFlight)])).value, 0);
  });
  await check(shape, "activation is owner-only and preserves legal receipts and choices", async () => {
    assert.equal((await first(db, "select count(*)::int value from public.account_legal_acceptances")).value, 0);
    assert.deepEqual((await db.query("select id,public_profile_enabled,discord_public_enabled from public.players order by id")).rows, before);
    await actor(db, "anon");
    assert.deepEqual(await visibleIds(db), []);
    await assert.rejects(db.query("select * from public.gaming_profile_disclosure"), { code: "42501" });
    await assert.rejects(db.query("select * from ironclad_private.gaming_profile_publications"), { code: "42501" });
    await assert.rejects(activate(db), { code: "42501" });
    await actor(db, "authenticated", oldOn);
    assert.deepEqual(await state(db), { mode: "legacy", public: false, revision: 0, objectionOpen: false });
    await assert.rejects(db.query("insert into ironclad_private.gaming_profile_publications(player_id,publication_basis) values($1,'legacy-choice')", [id(oldOn)]), { code: "42501" });
    await actor(db, "service_role");
    await assert.rejects(activate(db), { code: "42501" });
    await assert.rejects(db.query("select * from ironclad_private.gaming_profile_publications"), { code: "42501" });
    await assert.rejects(review(db, documented, 0, "verify-legacy"), { code: "42501" });
    await actor(db, "postgres");
    await db.query(`insert into public.platform_settings values('public_gaming_profile_notice','{"enabled":true,"version":"public-gaming-profile-v2"}')`);
  });

  assert.equal(await review(db, documented, 0, "verify-legacy"), true);
  assert.equal(await review(db, objected, 0, "verify-legacy"), true);
  assert.equal(await review(db, objected, 1, "open-objection"), true);
  assert.equal(await review(db, closed, 0, "verify-legacy"), false);
  assert.equal(await review(db, oldOff, 0, "verify-legacy"), false);
  await check(shape, "application and partner lookups remain service-only with factual admin data intact", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await actor(db, role, oldOff);
      await assert.rejects(db.query("select * from ironclad_private.gaming_profile_competition_aliases"), { code: "42501" });
      if (role !== "service_role") {
        await assert.rejects(db.query("select * from public.gaming_profile_disclosure"), { code: "42501" });
      }
    }
    assert.deepEqual((await db.query("select id,clerk_user_id,account_closed_at,profile_public from public.gaming_profile_disclosure where clerk_user_id=$1", [player(oldOff)])).rows,
      [{ id: id(oldOff), clerk_user_id: player(oldOff), account_closed_at: null, profile_public: false }]);
    assert.deepEqual((await db.query("select id,coh3_profile_id,account_closed_at,profile_public from public.gaming_profile_disclosure where id=$1", [id(oldOff)])).rows,
      [{ id: id(oldOff), coh3_profile_id: null, account_closed_at: null, profile_public: false }]);
    assert.equal((await db.query("select id,coh3_profile_id,in_game_name,display_name,account_closed_at,profile_public from public.gaming_profile_disclosure where coh3_profile_id=$1", ["901"])).rowCount, 0);
    assert.equal((await first(db, "select id from public.gaming_profile_disclosure where coh3_profile_id=$1", ["903"])).id, id(documented));
    const unchangedAdmin = await first(db, "select profile_id,player_name,registration_status from public.registrations where id=$1", [id(510)]);
    assert.deepEqual(unchangedAdmin, { profile_id: id(oldOff), player_name: "Official event alias", registration_status: "approved" });
  });
  await check(shape, "direct media, avatar and REST projections share eligibility", async () => {
    await actor(db, "anon");
    assert.deepEqual(await visibleIds(db), [id(documented)]);
    const shown = await profile(db, documented);
    assert.equal(shown.public_profile_enabled, true);
    assert.equal(shown.discord_username, null);
    assert.equal(shown.has_avatar, true);
    assert.equal(shown.avatar_url, null);
    assert.equal((await db.query("select player_id from public.public_player_showcases")).rows[0].player_id, id(documented));
    for (const n of [oldOff, oldOn, closed, objected]) {
      assert.equal(await highlight(db, n), false);
      assert.deepEqual((await first(db, "select public.get_public_player_combat_highlights($1) value", [id(n)])).value, []);
    }
    assert.equal(await highlight(db, documented), true);
    assert.equal((await first(db, "select public.get_public_player_combat_highlights($1) value", [id(documented)])).value.length, 1);
    await actor(db, "service_role");
    const gated = await first(db, "select profile_public,coh3_profile_id,display_name from public.gaming_profile_disclosure where id=$1", [id(oldOff)]);
    assert.deepEqual(gated, { profile_public: false, coh3_profile_id: null, display_name: null });
    assert.equal((await first(db, "select profile_public from public.gaming_profile_disclosure where id=$1", [id(documented)])).profile_public, true);
    assert.ok(await avatar(db, documented));
    assert.equal(await avatar(db, oldOff), null);
    assert.equal(await avatar(db, oldOff, oldOn), null);
    assert.ok(await avatar(db, oldOff, oldOff));
    assert.equal(await avatar(db, closed, closed), null);
  });

  await check(shape, "factual ranking rows, standings and legacy Main/Pro bridge are retained", async () => {
    await actor(db, "anon");
    const after = (await db.query(`select season_id,season_name,current_rank,total_points,matches_played,last_tournament_id,last_tournament_title
      from public.leaderboard_public_season_standings order by current_rank`)).rows;
    assert.deepEqual(after, factual);
    assert.equal(after.length, 5);
    assert.equal(after[0].total_points, shape === "production-bridge" ? 37 : 11);
    assert.equal(after[0].season_name, shape === "production-bridge" ? "2026 Pro Season 1" : "Fixture Season");
    for (const view of ["leaderboard_public_all_time_standings", "leaderboard_public_season_standings"]) {
      const rows = (await db.query(`select player_id,country,region,current_elo,has_avatar,avatar_url from public.${view}`)).rows;
      assert.equal(rows.length, 5);
      assert.deepEqual(rows.filter(row => row.player_id).map(row => row.player_id), [id(documented)]);
      assert.ok(rows.filter(row => !row.player_id).every(row => row.country === null && row.region === null && row.current_elo === null && !row.has_avatar && row.avatar_url === null));
    }
    const champions = (await db.query("select player_id,country,has_avatar,final_rank,final_points from public.leaderboard_public_season_champions")).rows;
    assert.equal(champions.length, 5);
    assert.ok(champions.every(row => row.final_rank === 1 && row.final_points === 11));
    assert.deepEqual(champions.filter(row => row.player_id).map(row => row.player_id), [id(documented)]);
    assert.ok(champions.filter(row => !row.player_id).every(row => row.country === null && !row.has_avatar));
    const seasonNames = (await db.query("select display_name,in_game_name from public.leaderboard_public_season_standings order by current_rank")).rows;
    assert.deepEqual(seasonNames, ["Official event alias", "Competitor", "competition-alias-3", "Former Competitor", "Objected event alias"]
      .map((name, index) => ({ display_name: index === 2 ? "optional-display-3" : name, in_game_name: name })));
    const allTimeNames = (await db.query("select in_game_name from public.leaderboard_public_all_time_standings order by display_order")).rows;
    assert.deepEqual(allTimeNames.map(row => row.in_game_name), ["Later official alias", "Competitor", "competition-alias-3", "Former Competitor", "Objected event alias"]);
    const championNames = (await db.query("select player_name from public.leaderboard_public_season_champions order by player_name")).rows;
    assert.deepEqual(new Set(championNames.map(row => row.player_name)), new Set(["Later official alias", "Competitor", "competition-alias-3", "Former Competitor", "Objected event alias"]));
  });

  await check(shape, "first authenticated profile upsert requires exact legal documents and digest", async () => {
    await actor(db, "postgres");
    await acceptanceReceipt(db, oldOff, true);
    await acceptanceReceipt(db, prospect, true);
    await acceptanceReceipt(db, wrongDocs, false);
    await acceptanceReceipt(db, untrusted, true);
    await acceptanceReceipt(db, marker, true);
    await acceptanceReceipt(db, wrongDigest, true);
    await db.query("update public.account_legal_acceptances set terms_sha256=repeat('e',64) where clerk_user_id=$1", [player(wrongDigest)]);
    await db.query("insert into ironclad_private.patch2_closed_accounts(subject_digest) values(sha256(convert_to($1,'UTF8')))", [player(marker)]);
    await db.query("grant insert on public.players to authenticated, service_role; grant select (clerk_user_id, in_game_name), update (in_game_name) on public.players to authenticated;");
    await actor(db, "authenticated", prospect);
    await createPlayer(db, prospect, { upsert: true });
    await actor(db, "authenticated", oldOff);
    await createPlayer(db, oldOff, { upsert: true });
    await actor(db, "service_role", untrusted);
    await createPlayer(db, untrusted);
    for (const n of [wrongDocs, noReceipt, marker, wrongDigest]) {
      await actor(db, "authenticated", n);
      await assert.rejects(createPlayer(db, n, { upsert: true }), { code: "42501" });
    }
    await actor(db, "anon");
    assert.deepEqual(await visibleIds(db), [id(documented), id(prospect)]);
    await actor(db, "authenticated", prospect);
    assert.deepEqual(await state(db), { mode: "new", public: true, revision: 1, objectionOpen: false });
    assert.equal(await setPublication(db, false, 1), false);
    await actor(db, "authenticated", oldOff);
    assert.equal((await state(db)).public, false);
  });

  await check(shape, "explicit legacy choice uses revisions; objection and closure win", async () => {
    await actor(db, "authenticated", oldOff);
    const firstState = await state(db);
    const second = connect(database);
    await second.connect();
    clients.push(second);
    await actor(second, "authenticated", oldOff);
    const elections = await Promise.all([setPublication(db, true, firstState.revision), setPublication(second, true, firstState.revision)]);
    assert.deepEqual(elections.sort(), [false, true]);
    const next = await state(db);
    assert.ok(next.revision > firstState.revision);
    assert.equal(next.public, true);
    assert.equal(await setPublication(db, true, next.revision), true);
    assert.equal((await state(db)).revision, next.revision);
    assert.equal(await setPublication(db, false, firstState.revision), false);
    assert.equal(await setPublication(db, false, next.revision), true);
    assert.equal((await state(db)).public, false);
    await actor(db, "postgres");
    await acceptanceReceipt(db, objected, true);
    await actor(db, "authenticated", objected);
    const objection = await state(db);
    assert.equal(objection.objectionOpen, true);
    assert.equal(objection.public, false);
    assert.equal(await setPublication(db, true, objection.revision), false);
    await actor(db, "postgres");
    assert.equal(await review(db, objected, objection.revision, "resolve-objection"), true);
    assert.equal(await review(db, objected, objection.revision, "verify-legacy"), false);
    assert.deepEqual((await db.query("select id,public_profile_enabled,discord_public_enabled from public.players where id <= $1 order by id", [id(objected)])).rows, before);
    const history = (await db.query("select revision, publication_basis from ironclad_private.gaming_profile_publications where player_id=$1 order by revision", [id(oldOff)])).rows;
    assert.equal(history.length, 2);
    assert.deepEqual(history.map(row => row.publication_basis), ["legacy-choice", null]);
    await actor(db, "service_role");
    await assert.rejects(db.query("update ironclad_private.gaming_profile_publications set objection_open=true where player_id=$1", [id(oldOff)]), { code: "42501" });
    await actor(db, "anon");
    assert.deepEqual(await visibleIds(db), [id(documented), id(prospect)]);
  });

  await check(shape, "documented legacy owner can unpublish without accepting the successors", async () => {
    await actor(db, "postgres");
    assert.equal((await first(db, "select count(*)::int value from public.account_legal_acceptances where clerk_user_id=$1", [player(documented)])).value, 0);
    await actor(db, "authenticated", documented);
    assert.deepEqual(await state(db), { mode: "legacy", public: true, revision: 1, objectionOpen: false });
    assert.equal(await setPublication(db, false, 1), true);
    assert.deepEqual(await state(db), { mode: "legacy", public: false, revision: 2, objectionOpen: false });
    await assert.rejects(setPublication(db, true, 2), { code: "42501", message: "ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED" });
    await actor(db, "anon");
    assert.deepEqual(await visibleIds(db), [id(prospect)]);
    assert.equal(await highlight(db, documented), false);
    await actor(db, "postgres");
    assert.deepEqual((await db.query(`select revision,publication_basis from ironclad_private.gaming_profile_publications
      where player_id=$1 order by revision`, [id(documented)])).rows, [
      { revision: "1", publication_basis: "documented-legacy" }, { revision: "2", publication_basis: null },
    ]);
    assert.equal((await first(db, "select public_profile_enabled value from public.players where id=$1", [id(documented)])).value, true);
  });
}

let processHandle;
let failure;
let serverLog = "";
try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, password + "\n", { flag: "wx" });
  const init = spawnSync(resolve(bin, "initdb.exe"), ["-D", data, "-U", "postgres", "--auth=scram-sha-256", "--pwfile", passwordFile, "--encoding=UTF8", "--locale=C", "--no-instructions"], { windowsHide: true, encoding: "utf8", timeout: 60000 });
  await unlink(passwordFile);
  assert.equal(init.status, 0, init.stderr);
  processHandle = spawn(resolve(bin, "postgres.exe"), ["-D", data, "-h", host, "-p", String(port), "-c", "unix_socket_directories=", "-c", "max_connections=8", "-c", "shared_buffers=32MB"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  processHandle.stdout.on("data", chunk => { serverLog += chunk; });
  processHandle.stderr.on("data", chunk => { serverLog += chunk; });
  let supervisor;
  for (let attempt = 0; attempt < 20; attempt++) {
    const pending = connect();
    try {
      await pending.connect();
      supervisor = pending;
      clients.push(pending);
      break;
    } catch {
      await pending.end().catch(() => {});
      await wait(250);
    }
  }
  assert.ok(supervisor, "Disposable PostgreSQL did not start");
  const [baseline, highlights, acceptance, closure, migration, fixture] = await Promise.all([
    sqlFile(files.baseline), sqlFile(files.highlights), sqlFile(files.acceptance), sqlFile(files.closure), baselineOnly ? null : sqlFile(files.migration),
    readFile(resolve(root, "tests/patch2-db/gaming-profile-publication-schema.sql"), "utf8"),
  ]);
  if (migration) report.migrationSha256 = createHash("sha256").update(migration).digest("hex");
  for (const [shape, database] of [["production-bridge", "publication_bridge"], ["unbridged", "publication_unbridged"]]) {
    await supervisor.query(`create database ${database}`);
    const db = connect(database);
    await db.connect();
    clients.push(db);
    await db.query(shape === "production-bridge" ? fixture : fixture.slice(fixture.indexOf("create schema auth;")));
    await installBaseline(db, shape, baseline, highlights, acceptance, closure);
    await seedPredecessor(db, shape);
    await check(shape, "exact checked-in public view definitions and fixture baseline", async () => {
      const definitions = (await db.query(`select relname, md5(replace(pg_get_viewdef(oid,true),chr(13),'')) digest
        from pg_class where relnamespace='public'::regnamespace and relname=any($1) order by relname`, [projectionNames])).rows;
      const shared = ["a3edad90e789fd680d963440c9c21333", "88a38eb4106336a67c7dc9219b550351", "517ba2f57d97aba850a6db596ac5b9d4"];
      const seasonal = shape === "production-bridge" ? ["ab479b90424ae6b665c015db159a00f4", "e698efcf08a2c962f6f31de907108dd6"] : ["4ccaf3c9e241d120263bb3e4caa67561", "55069c88ef25c6536313f8bed7c62c16"];
      assert.deepEqual(definitions.map(({ digest }) => digest), [shared[0], ...seasonal, ...shared.slice(1)]);
    });
    if (migration) await exercise(db, shape, migration, database);
  }
} catch (error) {
  failure = error;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (processHandle) {
    const stop = spawnSync(resolve(bin, "pg_ctl.exe"), ["-D", data, "-m", "fast", "stop", "-w"], { windowsHide: true, encoding: "utf8", timeout: 30000 });
    if (stop.status !== 0 && !failure) failure = new Error("Disposable PostgreSQL did not stop");
  }
  report.passed = !failure;
  if (failure) report.error = { message: failure.message, code: failure.code };
  await writeFile(resolve(run, "report.json"), JSON.stringify(report, null, 2) + "\n").catch(() => {});
  await writeFile(resolve(run, "postgres.log"), serverLog).catch(() => {});
}
if (failure) throw failure;
console.log(JSON.stringify({ ...report, report: resolve(run, "report.json") }, null, 2));
