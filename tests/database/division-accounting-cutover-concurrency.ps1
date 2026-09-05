#requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $PsqlPath,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int] $Port,

  [Parameter(Mandatory = $true)]
  [string] $DatabaseName,

  [string] $HostName = "127.0.0.1",

  [string] $UserName = "postgres"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
  throw "psql is unavailable."
}
if ($HostName -notin @("127.0.0.1", "localhost", "::1")) {
  throw "The Division settlement concurrency harness accepts loopback PostgreSQL only."
}
if ($DatabaseName -notmatch "^ironclad_pr7_[a-zA-Z0-9_]+$") {
  throw "The harness requires a disposable ironclad_pr7_* database."
}
if ($UserName -ne "postgres") {
  throw "The harness requires the disposable local postgres owner."
}

function New-PsqlProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Sql,

    [Parameter(Mandatory = $true)]
    [string] $ApplicationName
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = (Resolve-Path -LiteralPath $PsqlPath).Path
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Environment["PGCONNECT_TIMEOUT"] = "5"
  $startInfo.Environment["PGAPPNAME"] = $ApplicationName

  foreach ($argument in @(
      "-X",
      "-qAt",
      "-v", "ON_ERROR_STOP=1",
      "-v", "VERBOSITY=verbose",
      "-h", $HostName,
      "-p", $Port.ToString(),
      "-U", $UserName,
      "-d", $DatabaseName,
      "-c", $Sql
    )) {
    [void] $startInfo.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::Start($startInfo)
  return [pscustomobject]@{
    Process = $process
    StandardOutput = $process.StandardOutput.ReadToEndAsync()
    StandardError = $process.StandardError.ReadToEndAsync()
  }
}

function Complete-PsqlProcess {
  param(
    [Parameter(Mandatory = $true)]
    $Request,

    [int] $TimeoutMilliseconds = 20000
  )

  if (-not $Request.Process.WaitForExit($TimeoutMilliseconds)) {
    try {
      $Request.Process.Kill($true)
    } catch {
      $Request.Process.Kill()
    }
    throw "A local Division settlement race exceeded its bounded timeout."
  }

  return [pscustomobject]@{
    ExitCode = $Request.Process.ExitCode
    StandardOutput = $Request.StandardOutput.GetAwaiter().GetResult()
    StandardError = $Request.StandardError.GetAwaiter().GetResult()
  }
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Sql,

    [string] $ApplicationName = "ironclad-pr7-control"
  )

  return Complete-PsqlProcess -Request (
    New-PsqlProcess -Sql $Sql -ApplicationName $ApplicationName
  )
}

function Assert-PsqlSuccess {
  param(
    [Parameter(Mandatory = $true)]
    $Result,

    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  if ($Result.ExitCode -ne 0) {
    throw "$Label failed: $($Result.StandardError.Trim())"
  }
  if ($Result.StandardError -match "40P01") {
    throw "$Label encountered a deadlock."
  }
}

function Wait-ForSleep {
  param(
    [Parameter(Mandatory = $true)]
    [string] $ApplicationName,

    [Parameter(Mandatory = $true)]
    $Request
  )

  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    $probe = Invoke-Psql -Sql @"
select exists (
  select 1
  from pg_catalog.pg_stat_activity
  where application_name = '$ApplicationName'
    and state = 'active'
    and query like '%pg_sleep(1.5)%'
);
"@
    Assert-PsqlSuccess -Result $probe -Label "$ApplicationName lock probe"
    if ($probe.StandardOutput.Trim() -eq "t") {
      return
    }
    Start-Sleep -Milliseconds 50
  }

  [void] (Complete-PsqlProcess -Request $Request)
  throw "$ApplicationName did not reach the controlled race window."
}

$setup = Invoke-Psql -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
set session_replication_role = replica;

insert into public.players (
  id, clerk_user_id, display_name, in_game_name, current_elo, profile_completed
)
select
  ('f7000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'pr7-concurrency-player-' || number,
  'PR7 Concurrency Player ' || number,
  'PR7Concurrency' || number,
  case when number in (5, 6) then 1500 else 1000 end,
  true
from generate_series(1, 10) as number;

insert into public.tournaments (
  id, title, slug, description, banner_image_url, format, status,
  registration_enabled, prize_pool
)
values
  (
    'f7100000-0000-4000-8000-000000000001',
    'PR7 concurrent sibling fixture',
    'pr7-concurrent-sibling-fixture',
    'Disposable local concurrency fixture.',
    '/fixture.jpg', '1v1', 'in_progress', false, ''
  ),
  (
    'f7100000-0000-4000-8000-000000000002',
    'PR7 result finalization fixture',
    'pr7-result-finalization-fixture',
    'Disposable local result race fixture.',
    '/fixture.jpg', '1v1', 'in_progress', false, ''
  ),
  (
    'f7100000-0000-4000-8000-000000000003',
    'PR7 authenticated trigger fixture',
    'pr7-authenticated-trigger-fixture',
    'Disposable local authenticated-trigger fixture.',
    '/fixture.jpg', '1v1', 'in_progress', false, ''
  );

insert into public.tournament_brackets (
  id, tournament_id, name, elo_rules, max_players, launched_at
)
values
  ('f7200000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001', 'Academy', 'fixture', 8, clock_timestamp()),
  ('f7200000-0000-4000-8000-000000000002', 'f7100000-0000-4000-8000-000000000001', 'Challenge', 'fixture', 8, clock_timestamp()),
  ('f7200000-0000-4000-8000-000000000003', 'f7100000-0000-4000-8000-000000000001', 'Main', 'fixture', 8, clock_timestamp()),
  ('f7200000-0000-4000-8000-000000000004', 'f7100000-0000-4000-8000-000000000002', 'Academy', 'fixture', 8, clock_timestamp()),
  ('f7200000-0000-4000-8000-000000000005', 'f7100000-0000-4000-8000-000000000003', 'Academy', 'fixture', 8, clock_timestamp());

insert into public.registrations (
  id, profile_id, clerk_user_id, player_name, submitted_elo,
  tournament_title, bracket_name, registration_status, elo_status,
  tournament_id, tournament_bracket_id
)
select
  ('f7300000-0000-4000-' || lpad(division_number::text, 4, '0') || '-' || lpad(player_number::text, 12, '0'))::uuid,
  ('f7000000-0000-4000-8000-' || lpad(((division_number - 1) * 2 + player_number)::text, 12, '0'))::uuid,
  'pr7-concurrency-player-' || ((division_number - 1) * 2 + player_number),
  'PR7Concurrency' || ((division_number - 1) * 2 + player_number),
  case when division_number = 3 then 1500 else 1000 end,
  case
    when division_number = 4 then 'PR7 result finalization fixture'
    when division_number = 5 then 'PR7 authenticated trigger fixture'
    else 'PR7 concurrent sibling fixture'
  end,
  case division_number when 1 then 'Academy' when 2 then 'Challenge' when 3 then 'Main' else 'Academy' end,
  'approved', 'verified',
  case
    when division_number = 4 then 'f7100000-0000-4000-8000-000000000002'::uuid
    when division_number = 5 then 'f7100000-0000-4000-8000-000000000003'::uuid
    else 'f7100000-0000-4000-8000-000000000001'::uuid
  end,
  ('f7200000-0000-4000-8000-' || lpad(division_number::text, 12, '0'))::uuid
from generate_series(1, 5) as division_number
cross join generate_series(1, 2) as player_number;

insert into public.generated_brackets (
  id, tournament_bracket_id, format, participant_count, slot_count, generated_by
)
select
  ('f7400000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('f7200000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'round_robin', 2, 2, 'pr7-concurrency'
from generate_series(1, 5) as number;

insert into public.bracket_rounds (
  id, generated_bracket_id, round_number, name
)
select
  ('f7500000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('f7400000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  1, 'Round Robin'
from generate_series(1, 5) as number;

insert into public.tournament_matches (
  id, generated_bracket_id, round_id, match_number,
  player_one_registration_id, player_two_registration_id,
  player_one_score, player_two_score, winner_registration_id, status
)
select
  ('f7600000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('f7400000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('f7500000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  1,
  ('f7300000-0000-4000-' || lpad(number::text, 4, '0') || '-000000000001')::uuid,
  ('f7300000-0000-4000-' || lpad(number::text, 4, '0') || '-000000000002')::uuid,
  case when number < 4 then 2 else null end,
  case when number < 4 then 0 else null end,
  case when number < 4
    then ('f7300000-0000-4000-' || lpad(number::text, 4, '0') || '-000000000001')::uuid
    else null
  end,
  case when number < 4 then 'completed' else 'scheduled' end
from generate_series(1, 5) as number;

insert into public.tournament_standings (
  generated_bracket_id, registration_id, wins, losses, points, rank
)
select
  ('f7400000-0000-4000-8000-' || lpad(division_number::text, 12, '0'))::uuid,
  ('f7300000-0000-4000-' || lpad(division_number::text, 4, '0') || '-' || lpad(player_number::text, 12, '0'))::uuid,
  case when player_number = 1 then 1 else 0 end,
  case when player_number = 1 then 0 else 1 end,
  case when player_number = 1 then 3 else 0 end,
  player_number
from generate_series(1, 5) as division_number
cross join generate_series(1, 2) as player_number;

set session_replication_role = origin;

"@
Assert-PsqlSuccess -Result $setup -Label "Concurrency fixture setup"

$sameApplication = "ironclad-pr7-same-first"
$sameFirst = New-PsqlProcess -ApplicationName $sameApplication -Sql @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0));
select pg_catalog.pg_sleep(1.5);
select public.settle_leaderboard_division('f7200000-0000-4000-8000-000000000001', null);
commit;
"@
Wait-ForSleep -ApplicationName $sameApplication -Request $sameFirst
$sameSecond = New-PsqlProcess -ApplicationName "ironclad-pr7-same-second" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
select public.settle_leaderboard_division('f7200000-0000-4000-8000-000000000001', null);
"@
$sameFirstResult = Complete-PsqlProcess -Request $sameFirst
$sameSecondResult = Complete-PsqlProcess -Request $sameSecond
Assert-PsqlSuccess -Result $sameFirstResult -Label "first same-Division settlement"
Assert-PsqlSuccess -Result $sameSecondResult -Label "second same-Division settlement"
if ($sameFirstResult.StandardOutput -notmatch '"settlementCreated"\s*:\s*true') {
  throw "The first same-Division settlement did not create the receipt."
}
if ($sameSecondResult.StandardOutput -notmatch '"settlementCreated"\s*:\s*false') {
  throw "The second same-Division settlement did not deduplicate."
}

$siblingApplication = "ironclad-pr7-sibling-first"
$siblingFirst = New-PsqlProcess -ApplicationName $siblingApplication -Sql @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0));
select pg_catalog.pg_sleep(1.5);
select public.settle_leaderboard_division('f7200000-0000-4000-8000-000000000002', null);
commit;
"@
Wait-ForSleep -ApplicationName $siblingApplication -Request $siblingFirst
$siblingSecond = New-PsqlProcess -ApplicationName "ironclad-pr7-sibling-second" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
select public.settle_leaderboard_division('f7200000-0000-4000-8000-000000000003', null);
"@
$siblingFirstResult = Complete-PsqlProcess -Request $siblingFirst
$siblingSecondResult = Complete-PsqlProcess -Request $siblingSecond
Assert-PsqlSuccess -Result $siblingFirstResult -Label "first sibling settlement"
Assert-PsqlSuccess -Result $siblingSecondResult -Label "second sibling settlement"

$resultApplication = "ironclad-pr7-result-finalization"
$resultFinalization = New-PsqlProcess -ApplicationName $resultApplication -Sql @"
begin;
update public.tournament_matches
set
  player_one_score = 2,
  player_two_score = 0,
  winner_registration_id = 'f7300000-0000-4000-0004-000000000001',
  status = 'completed'
where id = 'f7600000-0000-4000-8000-000000000004';
select pg_catalog.pg_sleep(1.5);
commit;
"@
Wait-ForSleep -ApplicationName $resultApplication -Request $resultFinalization
$resultSettlement = New-PsqlProcess -ApplicationName "ironclad-pr7-result-settlement" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
select public.settle_leaderboard_division('f7200000-0000-4000-8000-000000000004', null);
"@
$resultFinalizationResult = Complete-PsqlProcess -Request $resultFinalization
$resultSettlementResult = Complete-PsqlProcess -Request $resultSettlement
Assert-PsqlSuccess -Result $resultFinalizationResult -Label "result finalization"
Assert-PsqlSuccess -Result $resultSettlementResult -Label "concurrent explicit settlement"

$participantServiceBoundary = Invoke-Psql -Sql @'
-- Local-only database leg of the Clerk-authenticated Server Action.
-- No SECURITY DEFINER test helper; the real server uses the service-role RPCs.
set session authorization service_role;
set request.jwt.claims = '{"role":"service_role","sub":"isolated-release-repair-server"}';
do $$
declare
  v_prepared jsonb;
  v_claimed jsonb;
  v_committed jsonb;
  v_duplicate jsonb;
begin
  begin
    perform public.prepare_match_replay_upload_attempt(
      'f7600000-0000-4000-8000-000000000005', 'not-a-match-participant',
      'f7300000-0000-4000-0005-000000000001', 2, 0,
      array[1024,1024],
      array['f7300000-0000-4000-0005-000000000001','f7300000-0000-4000-0005-000000000001']::uuid[]);
    raise exception 'Non-participant unexpectedly prepared replay evidence';
  exception when raise_exception then
    if sqlerrm not like '%not a participant%' then raise; end if;
  end;
  v_prepared := public.prepare_match_replay_upload_attempt(
    'f7600000-0000-4000-8000-000000000005', 'pr7-concurrency-player-9',
    'f7300000-0000-4000-0005-000000000001', 2, 0,
    array[1024,1024],
    array['f7300000-0000-4000-0005-000000000001','f7300000-0000-4000-0005-000000000001']::uuid[]);
  if v_prepared->>'outcome' <> 'prepared' then raise exception 'Prepare did not create an attempt'; end if;
  v_claimed := public.claim_match_replay_attempt_finalization(
    (v_prepared->>'attempt_id')::uuid,
    'f7600000-0000-4000-8000-000000000005', 'pr7-concurrency-player-9',
    'f7300000-0000-4000-0005-000000000001', 2, 0);
  if v_claimed->>'outcome' <> 'claimed' then raise exception 'Claim did not acquire finalization'; end if;
  v_committed := public.commit_match_replay_attempt_result(
    (v_prepared->>'attempt_id')::uuid, (v_claimed->>'claim_id')::uuid,
    'f7600000-0000-4000-8000-000000000005', 'pr7-concurrency-player-9',
    array[repeat('a',64),repeat('b',64)], 'Local canonical participant test');
  if (v_committed->>'report_group_id') is null then raise exception 'Canonical commit did not create report'; end if;
  v_duplicate := public.commit_match_replay_attempt_result(
    (v_prepared->>'attempt_id')::uuid, (v_claimed->>'claim_id')::uuid,
    'f7600000-0000-4000-8000-000000000005', 'pr7-concurrency-player-9',
    array[repeat('a',64),repeat('b',64)], 'Local idempotent retry');
  if v_duplicate is distinct from v_committed then raise exception 'Commit retry changed the report'; end if;
  perform public.confirm_match_result_report_group_api(
    (v_committed->>'report_group_id')::uuid, 'pr7-concurrency-player-10');
end;
$$;
reset session authorization;
select jsonb_build_object(
  'matchCompleted', (select status='completed' from public.tournament_matches where id='f7600000-0000-4000-8000-000000000005'),
  'eventCompleted', (select status='completed' from public.tournaments where id='f7100000-0000-4000-8000-000000000003'),
  'reportCount', (select count(*) from public.match_result_report_groups where match_id='f7600000-0000-4000-8000-000000000005'),
  'replayEvidenceCount', (select count(*) from public.match_result_submissions where match_id='f7600000-0000-4000-8000-000000000005'),
  'invitationTriggerEnabled', (select bool_and(tgenabled='O') from pg_trigger where tgname='tournaments_sync_division_invitation_availability')
);

'@ -ApplicationName "ironclad-pr7-participant-service-boundary"
Assert-PsqlSuccess -Result $participantServiceBoundary -Label "participant result through canonical service authority"
$participantResult = $participantServiceBoundary.StandardOutput.Trim() | ConvertFrom-Json
if (
  -not $participantResult.matchCompleted -or
  -not $participantResult.eventCompleted -or
  $participantResult.reportCount -ne 1 -or
  $participantResult.replayEvidenceCount -ne 2 -or
  -not $participantResult.invitationTriggerEnabled
) {
  throw "Canonical participant result did not converge with invitation reconciliation."
}

$verification = Invoke-Psql -Sql @"
with duplicate_events as (
  select 1
  from public.leaderboard_point_events
  where tournament_bracket_id::text like 'f7200000-0000-4000-8000-%'
    and source in ('system', 'recalculation')
  group by
    season_id,
    tournament_id,
    tournament_bracket_id,
    registration_id,
    player_id,
    bracket_type,
    points,
    event_type
  having count(*) > 1
)
select
  (select count(*) from public.leaderboard_division_settlements where tournament_bracket_id::text like 'f7200000-0000-4000-8000-%'),
  (select count(*) from duplicate_events),
  (select count(*) from ironclad_private.badge_reconciliation_targets where player_id::text like 'f7000000-0000-4000-8000-%'),
  (select count(*) from public.player_badge_awards where player_id::text like 'f7000000-0000-4000-8000-%'),
  (select count(*) from public.player_badge_reveals as reveal join public.player_badge_awards as award on award.id = reveal.player_badge_award_id where award.player_id::text like 'f7000000-0000-4000-8000-%'),
  (select count(*) from public.notifications where type = 'badge.unlocked' and recipient_clerk_user_id like 'pr7-concurrency-player-%'),
  (select count(*) from public.leaderboard_recalculation_runs where tournament_id = 'f7100000-0000-4000-8000-000000000002' and status = 'failed' and notes like 'Automatic Division settlement failed: SQLSTATE 55P03%');
"@
Assert-PsqlSuccess -Result $verification -Label "Concurrency convergence verification"

$counts = $verification.StandardOutput.Trim().Split("|")
if (
  $counts.Count -ne 7 -or
  $counts[0] -ne "5" -or
  $counts[1] -ne "0" -or
  $counts[2] -ne "10" -or
  $counts[3] -ne "0" -or
  $counts[4] -ne "0" -or
  $counts[5] -ne "0" -or
  [int] $counts[6] -lt 1
) {
  throw "Division settlement races did not converge on one stable accounting and Badge state."
}

$repair = Invoke-Psql -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr7-concurrency"}';
select public.recalculate_leaderboard_for_tournament(
  'f7100000-0000-4000-8000-000000000002',
  null
);
"@
Assert-PsqlSuccess -Result $repair -Label "post-contention Event repair"

$repairStatus = Invoke-Psql -Sql @"
select status
from public.leaderboard_recalculation_runs
where id = '$($repair.StandardOutput.Trim())';
"@
Assert-PsqlSuccess -Result $repairStatus -Label "post-contention repair status"
if ($repairStatus.StandardOutput.Trim() -ne "completed") {
  throw "The existing Event repair coordinator did not complete after contention."
}


[pscustomobject]@{
  sameDivision = "one receipt; second attempt no-op"
  siblingDivisions = "both settled through the same serialized writer"
  resultFinalization = "committed without deadlock"
  participantServiceBoundary = "prepare/claim/commit/retry/confirm; invitation trigger enabled"
  contentionAudit = "retryable existing recalculation run"
  eventRepair = "completed"
  settlementRows = [int] $counts[0]
  duplicatePointEvents = [int] $counts[1]
  badgeTargets = [int] $counts[2]
  badgeAwards = [int] $counts[3]
  revealAcknowledgements = [int] $counts[4]
  badgeNotifications = [int] $counts[5]
  database = $DatabaseName
  productionTouched = $false
} | ConvertTo-Json -Depth 3
