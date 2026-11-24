import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {read} from '../../scripts/consolidated-db/package.mjs';
import {run, scalar} from '../../scripts/consolidated-db/local-client.mjs';
import {checkLegacyProConcurrency} from './legacy-pro-concurrency.mjs';

// These reviewed source files match the differently versioned hosted receipts
// after normalizing line endings and trailing whitespace.
const productionSourceSteps = [
  ['20261024194450_announcement_rich_documents.sql','20261024173736_announcement_rich_documents.sql'],
  ['20261026214346_persisted_verified_relic_identity.sql','20261026181023_persisted_verified_relic_identity.sql'],
  ['20261027222650_public_competitive_profile_read_projections.sql','20261027181708_public_competitive_profile_read_projections.sql'],
];
const hotfix = '20261124023744_pro_season_settled_division_eligibility.sql';
const championshipBaseline='20261026173322_pro_championship_path_evidence.sql';
const championshipChecksum='6dd1e61dff2200d38739ae5856a793726c8e196f8cf977812f26470a707e93b6';
const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`;
const source = file => read(`supabase/migrations/${file}`);

async function applyLocalMigration(client, file, sql=source(file)) {
  const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(file);
  const ledger = `insert into supabase_migrations.schema_migrations(version,name,statements) values (${sqlLiteral(version)},${sqlLiteral(name)},array[${sqlLiteral(sql)}]::text[]);`;
  const withHistory = /\bcommit;\s*$/i.test(sql)
    ? sql.replace(/\bcommit;\s*$/i, () => `${ledger}\ncommit;`)
    : `begin;\n${sql}\n${ledger}\ncommit;`;
  await run(client, withHistory);
}

export async function checkProSeasonHotfix(client) {
  assert.equal(await scalar(client, 'select count(*)::integer from supabase_migrations.schema_migrations'), 160);
  const championshipPath=process.env.IRONCLAD_PRO_CHAMPIONSHIP_BASELINE_SQL??'';
  assert(isAbsolute(championshipPath),'Set IRONCLAD_PRO_CHAMPIONSHIP_BASELINE_SQL to the locally reviewed Production championship path migration');
  const championshipSql=readFileSync(championshipPath,'utf8');
  assert.equal(createHash('sha256').update(championshipSql).digest('hex'),championshipChecksum,'Championship source must match the audited local release artifact');
  const [[announcementVersion,announcementSource],...laterSteps]=productionSourceSteps;
  await applyLocalMigration(client,announcementVersion,source(announcementSource));
  await applyLocalMigration(client, championshipBaseline, championshipSql);
  for (const [version,file] of laterSteps) await applyLocalMigration(client,version,source(file));
  const beforeFixture = read('tests/consolidated-db/pro-season-hotfix-before.sql');
  const afterFixture = read('tests/consolidated-db/pro-season-hotfix-after.sql');
  const migration = source(hotfix);
  assert.doesNotMatch(migration, /^begin;|\bcommit;\s*$/i);
  const rollback = read('docs/releases/pro-season-settled-division-eligibility-rollback.sql');
  assert.match(rollback, /^begin;\r?$/im);
  assert.match(rollback, /\bcommit;\s*$/i);
  const rollbackBody = rollback.replace(/^begin;\r?$/im, '').replace(/\bcommit;\s*$/i, '');

  await client.query('begin');
  try {
    await run(client, beforeFixture);
    await run(client, migration);
    await client.query('savepoint before_rollback_check');
    await run(client, rollbackBody);
    assert.equal(await scalar(client, `select to_regclass('public.leaderboard_public_season_event_impacts') is null
      and (select valid_qualifying_event_count=1 from public.leaderboard_current_season)
      and (select total_points=5 and current_rank=8 from public.leaderboard_public_season_standings where bracket_type='pro' and in_game_name='Nub')
      and (select evidence=pg_temp.pro_hotfix_evidence() from pro_hotfix_before)`),true,'Rollback must restore definitions and keep all existing competition data');
    await client.query('rollback to before_rollback_check');
    await run(client, afterFixture);
  } finally {
    await client.query('rollback');
  }

  // Separate connections need a committed definition. The exact A/B fixture
  // above rolled back completely and remains independent of concurrent tests.
  await applyLocalMigration(client, hotfix);
  const concurrency = await checkLegacyProConcurrency(client, {independentSeasonFinalization:true});

  if (process.argv.includes('--keep-pro-season-fixture')) {
    // Retain only the synthetic two-event scenario for the local page preview.
    await client.query("begin;set local ironclad.test_hotfix_keep_fixture='on';");
    await run(client, beforeFixture);
    await client.query('commit');
  }

  return [
    'Exact synthetic before/after reproduces five to 25 points for Nub, 1/6 to 2/6, all ten rank/point pairs and both event impacts; ledger, receipts, memberships and historical evidence are unchanged',
    'Definitions-only rollback restores the old projection and preserves every recorded competition row and existing public view contract',
    'Incomplete, unscored, void and wrong-division evidence cannot qualify; repeat settlement and independent Main Career verified',
    'Academy and Challenge replay submission, confirmation, deadline and official completion succeed with Pro already scored; sixth Pro finalizes independently and later sibling completion preserves the season snapshot',
    ...concurrency,
  ];
}
