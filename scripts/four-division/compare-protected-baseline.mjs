// Read-only capture SQL and offline digest comparison. Contains no database credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT = "zzbnneprhjicmajpjkdg";
const P03 = "48c83ecd-ed3c-4a80-9830-fe5d6e035405";
const SEASON_TWO = "ad974140-9974-4135-bb96-c957df6f259b";
const ACTIVE_MATCHES = ["948d4324-1b0e-4e59-b081-814d6fd8866c", "50141c8b-9236-4aae-8916-1b5a203c9755"];
const WAITING_MATCH = "404461c6-58f2-4222-ae7c-42ac4d9a0cd2";
const FINAL_MATCH = "29f7e1ce-1079-4381-b55f-4f189be1e86e";
const BASE_TABLES = ["public.tournaments", "public.tournament_brackets", "public.tournament_matches", "public.tournament_standings", "public.registrations", "public.leaderboard_point_events", "public.leaderboard_division_settlements", "public.leaderboard_season_champions", "public.leaderboard_seasons", "public.leaderboard_tournament_season_memberships", "public.player_badge_awards", "public.account_legal_acceptances", "public.legal_documents", "ironclad_private.staging_synthetic_uat_players", "ironclad_private.staging_synthetic_uat_enrolments"];
const EXTRA_TABLES = ["public.registration_acceptances", "public.match_result_submissions", "public.match_result_report_groups", "public.match_game_result_authority", "public.leaderboard_player_season_stats"];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const subtract = (json, fields) => `${json}-${quote(fields[0])}${fields.slice(1).map((field) => `-${quote(field)}`).join("")}`;

function mutableProjection(table) {
  const json = "to_jsonb(r)-'division_model_version'-'official_bracket_type'";
  if (table === "public.tournaments") return { predicate: `r.id='${P03}'`, projection: subtract(json, ["status", "first_completed_at", "updated_at", "registration_enabled"]) };
  if (table === "public.leaderboard_seasons") return { predicate: `r.id='${SEASON_TWO}'`, projection: subtract(json, ["is_active", "end_date", "finalized_at", "updated_at"]) };
  if (table === "public.legal_documents") return { predicate: "r.document_kind in ('rulebook','ppa') and r.version='3.1'", projection: subtract(json, ["status", "updated_at"]) };
  if (table === "public.tournament_matches") {
    const common = subtract(json, ["player_one_score", "player_two_score", "winner_registration_id", "status", "updated_at", "official_result_submission_id", "official_result_decided_by", "official_result_decided_at", "activation_version", "activated_at", "deadline_at", "outcome_type", "deadline_ruled_at"]);
    return {
      predicate: `r.id in (${[...ACTIVE_MATCHES, WAITING_MATCH, FINAL_MATCH].map(quote).join(",")})`,
      projection: `case when r.id='${FINAL_MATCH}' then ${common}-'player_one_registration_id'-'player_two_registration_id' when r.id='${WAITING_MATCH}' then ${common}-'player_two_registration_id' else ${common} end`,
    };
  }
  return null;
}

export function buildProtectedCaptureSql() {
  const queries = [...BASE_TABLES, ...EXTRA_TABLES].map((table) => {
    const allowed = mutableProjection(table);
    // Participant advancement increments the match-room generation once for the
    // waiting semifinal and twice for the empty final. Reverse exactly those
    // increments for the original fingerprint; never omit the protected column.
    const preAdvancement = table === "public.tournament_matches"
      ? `case when r.status='completed' and r.id in ('${WAITING_MATCH}','${FINAL_MATCH}') then md5((${allowed.projection.replaceAll("to_jsonb(r)", `jsonb_set(to_jsonb(r),'{communication_generation}',to_jsonb(r.communication_generation-case when r.id='${FINAL_MATCH}' then 2 else 1 end))`)})::text) else null end`
      : "null";
    const where = table === "public.leaderboard_player_season_stats"
      ? "where r.season_id='4f3e4e61-fd56-4da4-81c9-3f92d7993c7a' and r.bracket_type='main'" : "";
    return `select jsonb_build_object('relation',${quote(table)},'count',count(*),'rows',coalesce(jsonb_agg(jsonb_build_object(
      'id',to_jsonb(r)->>'id','digest',md5((to_jsonb(r)-'division_model_version'-'official_bracket_type')::text),
      'transitionStableDigest',${allowed ? `case when ${allowed.predicate} then md5((${allowed.projection})::text) else null end` : "null"},
      'transitionPreAdvancementDigest',${preAdvancement}
    ) order by md5((to_jsonb(r)-'division_model_version'-'official_bracket_type')::text)),'[]'::jsonb)) as entry from ${table} r ${where}`;
  });
  return `select jsonb_build_object('capturedAt',now(),'stagingProject','${PROJECT}','excludedAdditiveColumns',jsonb_build_array('division_model_version','official_bracket_type'),'tables',(select jsonb_agg(entry) from (${queries.join(" union all ")}) captures)) as snapshot;`;
}

/**
 * @typedef {{ stagingProject: string, tables: Array<{ relation: string, count: number, rows: Array<{ id: string | null, digest: string, transitionStableDigest?: string | null, transitionPreAdvancementDigest?: string | null }> }> }} ProtectedCapture
 * @param {{ baseline: ProtectedCapture, current: ProtectedCapture, transitionBaseline?: ProtectedCapture, phase?: string }} input
 */
export function compareProtectedBaseline({ baseline, current, transitionBaseline, phase = "migration" }) {
  assert(["migration", "transition"].includes(phase));
  for (const capture of [baseline, current, transitionBaseline].filter(Boolean)) {
    assert.equal(capture.stagingProject, PROJECT);
    assert.equal(new Set(capture.tables.map((table) => table.relation)).size, capture.tables.length);
    for (const table of capture.tables) {
      assert([...BASE_TABLES, ...EXTRA_TABLES].includes(table.relation));
      assert.equal(table.rows.length, table.count);
      for (const row of table.rows) {
        assert(row.id === null || typeof row.id === "string");
        assert(/^[a-f0-9]{32}$/.test(row.digest));
        assert(row.transitionStableDigest == null || /^[a-f0-9]{32}$/.test(row.transitionStableDigest));
        assert(row.transitionPreAdvancementDigest == null || /^[a-f0-9]{32}$/.test(row.transitionPreAdvancementDigest));
      }
    }
  }
  const baselineTables = new Map(baseline.tables.map((table) => [table.relation, table]));
  const supplemental = new Map((transitionBaseline?.tables ?? []).map((table) => [table.relation, table]));
  for (const table of EXTRA_TABLES) if (supplemental.has(table)) baselineTables.set(table, supplemental.get(table));
  const currentTables = new Map(current.tables.map((table) => [table.relation, table]));
  const report = [];
  for (const [relation, before] of baselineTables) {
    const after = currentTables.get(relation);
    if (!after) { report.push({ relation, failure: "missing_relation" }); continue; }
    const originals = supplemental.get(relation)?.rows ?? [];
    const remaining = [...after.rows];
    let unchanged = 0;
    let allowedTransitionChanges = 0;
    let unexpectedChanges = 0;
    for (const row of before.rows) {
      let index = remaining.findIndex((candidate) => candidate.digest === row.digest && candidate.id === row.id);
      if (index >= 0) { remaining.splice(index, 1); unchanged++; continue; }
      const original = originals.find((candidate) => candidate.id === row.id && candidate.digest === row.digest);
      index = remaining.findIndex((candidate) => row.id !== null && candidate.id === row.id);
      const knownAdvancement = relation === "public.tournament_matches" && [WAITING_MATCH, FINAL_MATCH].includes(row.id) &&
        index >= 0 && remaining[index].transitionPreAdvancementDigest === original?.transitionStableDigest;
      if (phase === "transition" && original?.transitionStableDigest && index >= 0 &&
        (remaining[index].transitionStableDigest === original.transitionStableDigest || knownAdvancement)) {
        remaining.splice(index, 1); allowedTransitionChanges++;
      } else { unexpectedChanges++; }
    }
    const additions = Math.max(0, after.count - before.count);
    report.push({ relation, originalCount: before.count, currentCount: after.count, unchanged, allowedTransitionChanges, unexpectedChanges,
      additions, passed: unexpectedChanges === 0 && (phase === "transition" || additions === 0) });
  }
  const passed = report.every((table) => table.passed === true);
  return { stagingProject: PROJECT, phase, passed, tables: report,
    note: "New rows are counted separately; dedicated lifecycle, alias, legal publication and season checks must validate their authorized scope. Existing rows are immutable except four P03 match results, P03 lifecycle, legacy Season 2 finalization, and two legal predecessor statuses with stable-column fingerprints. Waiting semifinal/final communication generations are checked against their original fingerprints by reversing exactly one/two normal participant-advancement increments." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "--capture-sql" && process.argv.length === 3) console.log(buildProtectedCaptureSql());
  else {
    const [baselinePath, currentPath, supplementalPath, phase = "migration"] = process.argv.slice(2);
    assert(baselinePath && currentPath && supplementalPath);
    const read = (file) => JSON.parse(readFileSync(file, "utf8"));
    const result = compareProtectedBaseline({ baseline: read(baselinePath), current: read(currentPath), transitionBaseline: read(supplementalPath), phase });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  }
}
