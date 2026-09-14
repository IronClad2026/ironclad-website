// Run: node tests/database/player-combat-highlights-local.mjs <absolute PGlite module path>
// PGlite 0.5.8 is an isolated test runtime, never an application dependency.
// This harness has NO connection-string or network API. Each run creates a fresh
// in-memory PostgreSQL database and closes it. The baseline is deliberately small:
// real roles, private player-column grants and RLS; fixture legal/closure helpers.
// It proves new-migration semantics, not the full Staging closure chain or concurrency.
import { readFileSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const modulePath = process.argv[2];
if (!modulePath || !isAbsolute(modulePath) || !modulePath.endsWith("index.js")) {
  throw new Error("Supply an absolute locally installed PGlite 0.5.8 dist/index.js path.");
}
assert.equal(JSON.parse(readFileSync(resolve(dirname(modulePath), "../package.json"), "utf8")).version, "0.5.8");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = await PGlite.create();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(resolve(root,
  "supabase/migrations/20260913235133_player_combat_highlights.sql"), "utf8");
const phaseA = readFileSync(resolve(root,
  "supabase/migrations/20260909234122_player_showcase_phase_a.sql"), "utf8").replace(/\r\n/g, "\n");
const helperStart = phaseA.indexOf("create function ironclad_private.normalize_player_showcase_thought(");
const helperEnd = phaseA.indexOf("\n$$;", helperStart) + 4;
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const normalizer = phaseA.slice(helperStart, helperEnd);
let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  checks++;
}
async function one(sql, values = []) {
  return (await db.query(sql, values)).rows[0];
}
async function scalar(sql, values = []) {
  return Object.values(await one(sql, values))[0];
}
async function role(name, sub = "") {
  assert.ok(["postgres", "anon", "authenticated", "service_role"].includes(name));
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false), set_config('request.jwt.claim.role',$2,false)",
    [JSON.stringify({ role: name, sub }), name]);
  if (name !== "postgres") await db.exec("set role " + name);
}
async function denied(sql, values, label) {
  let code;
  try { await db.query(sql, values); } catch (error) { code = error.code; }
  check(code === "42501", label);
}
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const closed = "33333333-3333-4333-8333-333333333333";
const verified = { codec: "avc", audioCodec: "aac", durationMs: 15000,
  width: 1920, height: 1080, fps: 60, byteLength: 1000,
  sha256: "a".repeat(64), etag: "local-fixture", hasPoster: false };
async function state() { return scalar("select public.get_my_player_combat_highlights()"); }
async function slot(number) { return (await state()).slots.find((row) => row.slotNumber === number); }
async function reserve(number, revision, requestId = crypto.randomUUID(), title = "Local clip", extras = {}) {
  return scalar("select public.reserve_my_player_combat_highlight($1::smallint,$2::bigint,$3::uuid,$4,$5,$6,$7::bigint,$8::bigint,$9,$10)",
    [number, revision, requestId, title, extras.fileName ?? "clip.mp4", extras.contentType ?? "video/mp4",
      extras.byteLength ?? 1000, extras.posterByteLength ?? 0,
      extras.declarationVersion ?? "v1", extras.declarationAccepted ?? true]);
}
async function complete(id, metadata = verified) {
  await role("service_role");
  return scalar("select public.complete_player_combat_highlight_upload($1,$2::jsonb)", [id, JSON.stringify(metadata)]);
}
async function clear(number, revision) {
  return scalar("select public.clear_my_player_combat_highlight($1::smallint,$2::bigint)", [number, revision]);
}
async function cancel(id, revision) {
  return scalar("select public.cancel_my_player_combat_highlight_upload($1,$2::bigint)", [id, revision]);
}
async function moderate(number, hidden, revision) {
  await role("service_role");
  return scalar("select public.moderate_player_combat_highlight($1,$2::smallint,$3,$4,$5::bigint)",
    [owner, number, hidden, "local-admin", revision]);
}
async function publicRead(id) {
  await role("anon");
  return scalar("select public.can_read_public_player_combat_highlight($1)", [id]);
}
try {
  const baseline = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema ironclad_private;
    revoke all on schema ironclad_private from public, anon, authenticated, service_role;
    grant usage on schema public, auth to anon,authenticated,service_role;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),auth.jwt()->>'role');
    $$;
    create table public.players(
      id uuid primary key, clerk_user_id text not null unique,
      public_profile_enabled boolean not null default false, account_closed_at timestamptz
    );
    alter table public.players enable row level security;
    alter table public.players force row level security;
    grant select(id,clerk_user_id,public_profile_enabled) on public.players to authenticated;
    create policy own_player on public.players for select to authenticated
      using (clerk_user_id=auth.jwt()->>'sub');
    create table public.platform_settings(key text primary key,value jsonb not null);
    create table ironclad_private.local_legal_fixture(sub text primary key, accepted boolean not null);
    create table ironclad_private.local_retained_history(player_id uuid primary key);
    create function public.player_showcase_enabled() returns boolean
      language sql stable security definer set search_path=pg_catalog as $$
      select coalesce((select value->'enabled'='true'::jsonb from public.platform_settings
        where key='player_showcase'),false);
    $$;
    create function ironclad_private.player_showcase_has_current_legal_acceptance(p_sub text)
      returns boolean language sql stable security definer set search_path=pg_catalog as $$
      select coalesce((select accepted from ironclad_private.local_legal_fixture where sub=p_sub),false);
    $$;
    create function public.get_my_player_showcase() returns jsonb language sql stable
      security definer set search_path=pg_catalog as $$
      select jsonb_build_object('player_id',id) from public.players
      where clerk_user_id=auth.jwt()->>'sub' and account_closed_at is null;
    $$;
    revoke all on function public.get_my_player_showcase() from public,anon,service_role;
    grant execute on function public.get_my_player_showcase() to authenticated;
    -- Explicit local-only stand-in: it models delete vs retained closed parent.
    -- No claim that this replaces the real multi-feature Staging closure chain.
    create function public.close_ironclad_player_account(p_clerk_user_id text) returns jsonb
      language plpgsql security definer set search_path=pg_catalog as $$
    declare v_id uuid;
    begin
      select id into v_id from public.players where clerk_user_id=p_clerk_user_id for update;
      if exists(select 1 from ironclad_private.local_retained_history where player_id=v_id) then
        update public.players set clerk_user_id='closed:'||id, account_closed_at=clock_timestamp(),
          public_profile_enabled=false where id=v_id;
      else delete from public.players where id=v_id;
      end if;
      return jsonb_build_object('closed',true);
    end;
    $$;
    insert into public.players(id,clerk_user_id) values
      ('${owner}','local-owner'),('${other}','local-other'),('${closed}','local-closed');
    insert into ironclad_private.local_legal_fixture values
      ('local-owner',true),('local-other',true),('local-closed',false);
    insert into public.platform_settings values ('player_showcase','{"enabled":true}');
  `;
  await db.exec(baseline);
  await db.exec(normalizer);
  const priorClosure = await scalar("select prosrc from pg_proc where oid='public.close_ironclad_player_account(text)'::regprocedure");
  await db.exec(migration);
  check(await scalar("select not public.player_combat_highlights_enabled()"), "new feature defaults off");
  check(await scalar("select prosrc from pg_proc where oid='public.close_ironclad_player_account_without_combat_highlights(text)'::regprocedure") === priorClosure, "prior closure body preserved");
  await role("authenticated", "local-owner");
  let r = await state();
  check(r.slots.length === 3 && r.slots.every((s) => s.revision === 0 && s.clip === null), "virtual empty three-slot state");
  check((await reserve(1, 0)).code === "feature-disabled", "flag blocks reserve");
  check((await clear(1, 0)).code === "saved", "disabled empty clear remains available");
  await role("postgres");
  await db.exec("update public.platform_settings set value='{\"enabled\":true}' where key='player_combat_highlights'");
  await role("authenticated", "local-owner");
  for (const [label, number, title, extras] of [
    ["quota fourth slot",4,"clip",{}],["64-codepoint title",1,"a".repeat(65),{}],
    ["rights required",1,"clip",{declarationAccepted:false}],
    ["rights version",1,"clip",{declarationVersion:"v2"}],
    ["byte cap",1,"clip",{byteLength:15000001}],
    ["poster cap",1,"clip",{posterByteLength:200001}],
    ["filename path",1,"clip",{fileName:"x/y.mp4"}],
  ]) check((await reserve(number,0,crypto.randomUUID(),title,extras)).code === "invalid-input", label);
  const request = crypto.randomUUID();
  r = await reserve(1,0,request,"  Cafe\u0301\t世界  ");
  const first = r.uploadId;
  check(r.code === "saved" && first === request && r.state.slots[0].revision === 1, "first reservation allocates rows and revision");
  check((await reserve(1,0,request,"  Cafe\u0301\t世界  ")).uploadId === first, "same request replay is idempotent");
  check((await reserve(1,1,request,"changed")).code === "invalid-input", "request payload immutable");
  check((await reserve(1,0)).code === "conflict", "stale reservation revision");
  check((await reserve(1,1)).code === "upload-pending", "simultaneous pending denied");
  check(await scalar("select count(player_id)::int from public.player_combat_highlight_slots") === 3, "owner RLS reads three rows without private players column");
  await denied("select account_closed_at from public.players", [], "players private column still denied");
  await denied("select moderated_by_clerk_user_id from public.player_combat_highlight_slots", [], "moderator identity denied");
  await denied("select * from ironclad_private.player_combat_highlight_uploads", [], "private reservation table denied");
  await denied("delete from public.player_combat_highlight_slots", [], "raw slot write denied");
  await denied("select public.complete_player_combat_highlight_upload($1,$2)", [first, verified], "owner cannot invoke service completion");
  const pending = await scalar("select public.get_my_player_combat_highlight_upload($1)", [first]);
  check(pending.title === "Café 世界" && pending.declarationVersion === "v1" && pending.declarationAcceptedAt, "normalized title and server rights timestamp");
  check(await scalar("select public.can_access_my_player_combat_highlight($1,'upload')", [first]), "owner may upload current reservation");
  await role("authenticated", "local-other");
  check(await scalar("select count(player_id)::int from public.player_combat_highlight_slots") === 0, "foreign slots hidden by RLS");
  check(!await scalar("select public.can_access_my_player_combat_highlight($1,'upload')", [first]), "foreign upload denied");
  check(await scalar("select public.get_my_player_combat_highlight_upload($1)", [first]) === null, "foreign reservation metadata denied");
  check((await cancel(first,1)).code === "invalid-input", "foreign cancel denied");
  check((await reserve(1,0,request)).code === "invalid-input", "foreign reservation UUID collision cannot overwrite");
  check(!await publicRead(first), "pending is not public");
  await denied("select public.get_my_player_combat_highlights()", [], "anon owner RPC denied");
  for (const [label, patch] of [
    ["duration",{durationMs:15001}],["fps",{fps:61}],["width",{width:1921}],["height",{height:1081}],
    ["bytes",{byteLength:999}],["mp4 codec",{codec:"vp9"}],["mp4 audio",{audioCodec:"opus"}],
    ["unknown key",{extra:"secret"}],["poster mismatch",{hasPoster:true}],["fractional integer",{width:1.5}],
    ["string numeric",{durationMs:"1000"}],["bad digest",{sha256:"not-a-hash"}],
  ]) check((await complete(first,{...verified,...patch})).code === "invalid-input", "verified " + label);
  check((await complete(first)).code === "saved", "verified first upload is ready");
  check((await complete(first)).code === "saved", "duplicate completion idempotent");
  check((await complete(first,{...verified,etag:"different"})).code === "invalid-input", "mismatched duplicate cannot retire ready media");
  check(!await publicRead(first), "private parent gates ready media");
  await role("postgres");
  await db.query("update public.players set public_profile_enabled=true where id=$1",[owner]);
  check(await publicRead(first), "public active current ready media allowed");
  let projected = await scalar("select public.get_public_player_combat_highlights($1)", [owner]);
  check(projected.length === 1 && Object.keys(projected[0]).sort().join(",") ===
    "contentType,displayOrder,durationMs,fps,hasPoster,height,slotNumber,title,uploadId,width", "public descriptor exact safe fields");
  await role("authenticated", "local-other");
  check((await scalar("select public.report_player_combat_highlight($1,'privacy')",[first])).code === "reported", "authenticated public report");
  check((await scalar("select public.report_player_combat_highlight($1,'privacy')",[first])).code === "reported", "repeat report idempotent");
  await role("service_role");
  const moderation = await scalar("select public.get_player_combat_highlights_for_moderation(null)");
  check(moderation.length === 1 && moderation[0].reportCount === 1, "reported moderation datasource bounded and aggregate only");
  await role("authenticated", "local-owner");
  let revision = (await slot(1)).revision;
  check((await moderate(1,true,revision-1)).code === "conflict", "stale moderation conflict");
  check((await moderate(1,true,revision)).code === "saved", "service moderation hides");
  check(!await publicRead(first), "hold denies public media");
  await role("authenticated", "local-owner");
  check(await scalar("select public.can_access_my_player_combat_highlight($1,'read')",[first]), "owner preview remains available under hold");
  revision = (await slot(1)).revision;
  r = await reserve(1,revision);
  const replacement = r.uploadId;
  check(r.state.slots[0].clip.uploadId === first && r.state.slots[0].hidden, "pending replacement preserves current clip and hold");
  check((await complete(replacement)).code === "saved", "replacement becomes ready");
  await role("authenticated", "local-owner");
  check((await slot(1)).clip.uploadId === replacement && (await slot(1)).hidden, "replacement cannot clear moderation hold");
  check(!await publicRead(first), "retired UUID immediately loses access");
  check((await complete(first)).code === "conflict", "stale completion cannot resurrect retired clip");
  await role("authenticated", "local-owner");
  revision = (await slot(1)).revision;
  check((await moderate(1,false,revision)).code === "saved", "service restore");
  check(await publicRead(replacement), "restored replacement public");
  await role("authenticated", "local-owner");
  let slots = (await state()).slots;
  const revisions = [3,1,2].map((n) => slots.find((s) => s.slotNumber === n).revision);
  r = await scalar("select public.reorder_my_player_combat_highlights($1::smallint[],$2::bigint[])",[[3,1,2],revisions]);
  check(r.code === "saved" && r.state.slots.map((s) => s.slotNumber).join(",") === "3,1,2", "atomic reorder retains stable slot identities");
  check((await scalar("select public.reorder_my_player_combat_highlights($1::smallint[],$2::bigint[])",[[3,1,2],revisions])).code === "conflict", "reorder rejects stale vector");
  check((await scalar("select public.reorder_my_player_combat_highlights($1::smallint[],$2::bigint[])",[[1,1,2],[0,0,0]])).code === "invalid-input", "reorder rejects duplicate slot");
  r = await reserve(2,(await slot(2)).revision);
  check(r.code === "saved", "reserve after reorder avoids uniqueness collision");
  const canceled = r.uploadId;
  await role("postgres");
  await db.exec("update public.platform_settings set value='{\"enabled\":false}' where key='player_combat_highlights'; update ironclad_private.local_legal_fixture set accepted=false where sub='local-owner'");
  await role("authenticated", "local-owner");
  check((await cancel(canceled,(await slot(2)).revision)).code === "saved", "flag-off legal-outdated cancel allowed");
  check((await clear(1,(await slot(1)).revision)).code === "saved", "flag-off legal-outdated clear allowed");
  check(!await publicRead(replacement), "feature disabled public read denied");
  await role("postgres");
  await db.exec("update public.platform_settings set value='{\"enabled\":true}' where key='player_combat_highlights'");
  await role("authenticated", "local-owner");
  check((await reserve(1,(await slot(1)).revision)).code === "legal-required", "reserve checks current legal");
  await role("postgres");
  await db.exec("update ironclad_private.local_legal_fixture set accepted=true where sub='local-owner'");

  // A fresh already-expired fixture tests expiration without altering immutable deadlines.
  await db.query(`insert into ironclad_private.player_combat_highlight_uploads
    (id,player_id,slot_number,request_id,title,file_name,content_type,byte_length,
      declaration_version,expires_at)
    values ($1,$2,3,$3,'expired','expired.mp4','video/mp4',1000,'v1',clock_timestamp()-interval '2 minutes')`,
    [closed,owner,crypto.randomUUID()]);
  await db.query("update public.player_combat_highlight_slots set pending_upload_id=$1 where player_id=$2 and slot_number=3",[closed,owner]);
  await role("service_role");
  let claims = await scalar("select public.claim_player_combat_highlight_cleanup(50)");
  let expiredClaim = claims.find((c) => c.uploadId === closed);
  check(Boolean(expiredClaim), "cleanup sweep expires and claims abandoned reservation");
  await role("authenticated", "local-owner");
  check((await slot(3)).pendingUploadId === null, "expiry sweep detaches pending generation");
  await role("service_role");
  check((await scalar("select public.finish_player_combat_highlight_cleanup($1,$2,true,null)",[closed,crypto.randomUUID()])).code === "claim-lost", "wrong cleanup token denied");
  check((await scalar("select public.finish_player_combat_highlight_cleanup($1,$2,false,'provider-unavailable')",[closed,expiredClaim.claimToken])).code === "saved", "cleanup failure records retry");
  await role("postgres");
  check(await scalar("select cleanup_after>clock_timestamp() and cleanup_claim_token is null from ironclad_private.player_combat_highlight_uploads where id=$1",[closed]), "cleanup failure backs off and releases lease");
  await db.query("update ironclad_private.player_combat_highlight_uploads set cleanup_after=clock_timestamp()-interval '1 second' where id=$1",[closed]);
  await role("service_role");
  claims = await scalar("select public.claim_player_combat_highlight_cleanup(50)");
  expiredClaim = claims.find((c) => c.uploadId === closed);
  check(Boolean(expiredClaim), "due cleanup retry reclaims");
  check((await scalar("select public.finish_player_combat_highlight_cleanup($1,$2,true,null)",[closed,expiredClaim.claimToken])).code === "saved", "provider success tombstones attempt");
  await role("postgres");
  check(await scalar("select state='deleted' and player_id=$2::uuid and title is null and file_name is null from ironclad_private.player_combat_highlight_uploads where id=$1",[closed,owner]), "normal deletion keeps rate-limit owner but removes presentation");
  await denied("update ironclad_private.player_combat_highlight_uploads set expires_at=expires_at+interval '1 hour' where id=$1",[closed], "immutable reservation deadline");
  await denied("update ironclad_private.player_combat_highlight_uploads set state='reserved' where id=$1",[closed], "deleted attempt cannot revive");
  // Bound quarantined bytes independently from the hourly rate.
  await role("authenticated", "local-owner");
  while (true) {
    const attempt = await reserve(2,(await slot(2)).revision);
    if (attempt.code === "upload-limit") break;
    check(attempt.code === "saved", "bounded reservation loop creates only valid attempts");
    check((await cancel(attempt.uploadId,(await slot(2)).revision)).code === "saved", "bounded reservation loop cancels");
  }
  await role("postgres");
  check(await scalar("select count(*)::int from ironclad_private.player_combat_highlight_uploads where player_id=$1 and state<>'deleted'",[owner]) === 9, "nine non-deleted attempt bound");
  // Only local fixture cleanup clocks are advanced. No provider object exists.
  await db.query("update ironclad_private.player_combat_highlight_uploads set cleanup_after=clock_timestamp()-interval '1 second' where player_id=$1 and state='delete_pending'",[owner]);
  await role("service_role");
  claims = await scalar("select public.claim_player_combat_highlight_cleanup(50)");
  for (const claim of claims) {
    check((await scalar("select public.finish_player_combat_highlight_cleanup($1,$2,true,null)",
      [claim.uploadId,claim.claimToken])).code === "saved", "claimed fixture cleanup succeeds");
  }
  await role("authenticated", "local-owner");
  while (true) {
    const attempt = await reserve(2,(await slot(2)).revision);
    if (attempt.code === "upload-limit") break;
    check(attempt.code === "saved", "hourly bound loop creates valid attempt");
    check((await cancel(attempt.uploadId,(await slot(2)).revision)).code === "saved", "hourly bound loop cancels");
  }
  await role("postgres");
  check(await scalar("select count(*)::int from ironclad_private.player_combat_highlight_uploads where player_id=$1",[owner]) === 12, "twelve attempts per hour survives successful cleanup");

  async function seedClosure(playerId, sub, retained = false) {
    await role("postgres");
    await db.query("insert into public.players(id,clerk_user_id,public_profile_enabled) values ($1,$2,true) on conflict (id) do update set public_profile_enabled=true",[playerId,sub]);
    if (retained) await db.query("insert into ironclad_private.local_retained_history values ($1)",[playerId]);
    await db.query("insert into public.player_combat_highlight_slots(player_id,slot_number,display_order) select $1,n,n from generate_series(1,3)n",[playerId]);
    const current = crypto.randomUUID(), pending = crypto.randomUUID(), leased = crypto.randomUUID();
    for (const [id, stateName] of [[current,"ready"],[pending,"reserved"],[leased,"delete_pending"]]) {
      await db.query(`insert into ironclad_private.player_combat_highlight_uploads(
        id,player_id,slot_number,request_id,title,file_name,content_type,byte_length,
        declaration_version,state,verified,ready_at,cleanup_after)
        values ($1,$2,1,$3,'fixture private title','fixture.mp4','video/mp4',1000,'v1',$4,
          case when $4='ready' then $5::jsonb else null end,
          case when $4='ready' then clock_timestamp() else null end,
          case when $4='delete_pending' then clock_timestamp()-interval '1 second' else null end)`,
        [id,playerId,crypto.randomUUID(),stateName,JSON.stringify(verified)]);
    }
    await db.query("update public.player_combat_highlight_slots set current_upload_id=$1,pending_upload_id=$2 where player_id=$3 and slot_number=1",[current,pending,playerId]);
    await role("service_role");
    const claim = (await scalar("select public.claim_player_combat_highlight_cleanup(50)")).find((c) => c.uploadId === leased);
    check(Boolean(claim), "closure fixture has outstanding cleanup lease");
    return { current,pending,leased,claim };
  }
  const closureFixture = await seedClosure(closed,"local-closed");
  check(await publicRead(closureFixture.current), "fresh closure fixture has a visible ready clip");
  await role("service_role");
  check((await scalar("select public.close_ironclad_player_account('local-closed')")).closed, "closure executes with current and pending composite FKs");
  await role("postgres");
  check(await scalar("select count(*)::int from public.players where id=$1",[closed]) === 0, "local no-history parent deleted");
  check(await scalar("select count(*)::int from public.player_combat_highlight_slots where player_id=$1",[closed]) === 0, "closure deletes slots");
  check(await scalar(`select count(*)::int from ironclad_private.player_combat_highlight_uploads
    where id=any($1::uuid[]) and player_id is null and slot_number is null
      and state='delete_pending' and title is null and file_name is null`,
    [[closureFixture.current,closureFixture.pending,closureFixture.leased]]) === 3, "closure preserves scrubbed durable cleanup rows");
  check(await scalar("select cleanup_claim_token=$2::uuid from ironclad_private.player_combat_highlight_uploads where id=$1",
    [closureFixture.leased,closureFixture.claim.claimToken]), "closure preserves outstanding cleanup token");
  check(!await publicRead(closureFixture.current), "closed upload loses public eligibility");
  await role("authenticated","local-closed");
  check(await state() === null, "closed old JWT has no owner state");
  check(!await scalar("select public.can_access_my_player_combat_highlight($1,'read')",[closureFixture.current]), "closed old JWT loses owner media access");
  check((await complete(closureFixture.pending)).code === "profile-required", "late completion cannot revive closed reservation");
  await role("service_role");
  check((await scalar("select public.finish_player_combat_highlight_cleanup($1,$2,true,null)",
    [closureFixture.leased,closureFixture.claim.claimToken])).code === "saved", "outstanding claim can finish after closure");
  const retainedFixture = await seedClosure(other,"local-other",true);
  await role("service_role");
  await scalar("select public.close_ironclad_player_account('local-other')");
  await role("postgres");
  check(await scalar("select account_closed_at is not null and public_profile_enabled is false from public.players where id=$1",[other]), "local retained-history parent closes");
  check(await scalar("select reporter_player_id is null from ironclad_private.player_combat_highlight_reports where upload_id=$1",[first]), "closure scrubs reporter association");
  check(!await publicRead(retainedFixture.current), "retained closed parent never public");
  const directId = crypto.randomUUID();
  const direct = await seedClosure(directId,"local-direct");
  await role("postgres");
  await db.query("delete from public.players where id=$1",[directId]);
  check(await scalar("select count(*)::int from ironclad_private.player_combat_highlight_uploads where id=any($1::uuid[]) and player_id is null and state='delete_pending'",
    [[direct.current,direct.pending,direct.leased]]) === 3, "direct parent FK cascade retains cleanup despite circular references");
  // Transaction rollback restores fixture changes exactly, including feature flags.
  const before = await scalar("select jsonb_agg(to_jsonb(s) order by key) from public.platform_settings s");
  await db.exec("begin; update public.platform_settings set value='{\"enabled\":false}'; rollback;");
  check(JSON.stringify(await scalar("select jsonb_agg(to_jsonb(s) order by key) from public.platform_settings s")) === JSON.stringify(before), "rollback preserves original settings");
  // Validate the prepared assertion body in a SECOND fresh in-memory database.
  // First prove its intact live ledger guard refuses this local fixture database.
  // We then execute only the assertion body here; this harness cannot accept a
  // connection string, and no guard is removed or weakened in the Staging file.
  const stagingSql = readFileSync(resolve(root,
    "tests/database/player-combat-highlights-staging-contract.sql"), "utf8");
  const stagingDb = await PGlite.create();
  let stagingAssertions = 0;
  try {
    const stagingOwner = "c0bfabca-11bb-4d90-92f9-77119debe15b";
    const stagingOther = "03f83118-81c9-438c-92db-b5d307547197";
    await stagingDb.exec(baseline.replaceAll(owner,stagingOwner).replaceAll(other,stagingOther));
    await stagingDb.exec(normalizer);
    // The assertion checks exact deployed Phase A prosrc, without invoking it.
    const oldStart = phaseA.indexOf("create function public.close_ironclad_player_account(");
    const oldEnd = phaseA.indexOf("\n$$;",oldStart)+4;
    assert.ok(oldStart>=0 && oldEnd>oldStart);
    await stagingDb.exec("drop function public.close_ironclad_player_account(text)");
    await stagingDb.exec(phaseA.slice(oldStart,oldEnd));
    await stagingDb.exec(migration);
    await stagingDb.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text,name text,statements text[])");
    let refused = false;
    try { await stagingDb.exec(stagingSql); }
    catch (error) { refused = error.message === "Exact Staging migration history or approved source guard failed"; }
    check(refused,"intact Staging guard refuses local fixture history");
    await stagingDb.exec("rollback");
    const assertionStart = stagingSql.indexOf("create temporary table combat_contract_checks");
    assert.ok(assertionStart>0);
    const results = await stagingDb.exec("begin;\n" + stagingSql.slice(assertionStart));
    const assertionResult = results.find((result) => result.rows?.[0]?.passed_assertions);
    stagingAssertions = assertionResult?.rows[0].passed_assertions ?? 0;
    check(stagingAssertions >= 70,"prepared Staging assertion body executes in isolated PostgreSQL");
    check((await stagingDb.query("select count(*)::int as count from public.player_combat_highlight_slots")).rows[0].count === 0,
      "prepared Staging assertion body rolls back all feature rows");
  } finally { await stagingDb.close(); }

  console.log(JSON.stringify({ok:true, assertions:checks, stagingBodyAssertions:stagingAssertions, runtime:"PGlite 0.5.8",
    serverVersion:await scalar("show server_version"),
    scope:"new migration against explicit minimal baseline; no live database, provider bytes or concurrent sessions"}));
} catch (error) {
  console.error(JSON.stringify({ok:false, assertions:checks, message:error.message,
    code:error.code, detail:error.detail, where:error.where}));
  process.exitCode = 1;
} finally {
  await db.close();
}
