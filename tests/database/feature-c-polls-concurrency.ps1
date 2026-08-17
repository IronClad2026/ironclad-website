[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $PsqlPath
)

$ErrorActionPreference = "Stop"

$pollId = "c7000000-0000-4000-8000-000000000001"
$eligibilityId = "c7200000-0000-4000-8000-000000000001"
$setupPath = Join-Path $PSScriptRoot "feature-c-polls-concurrency-setup.sql"
$cleanupPath = Join-Path $PSScriptRoot "feature-c-polls-concurrency-cleanup.sql"

foreach ($name in @("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE")) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "Missing required process-local PostgreSQL environment: $name"
  }
}

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
  throw "PostgreSQL client is unavailable."
}

function New-PsqlProcess([string] $arguments) {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $PsqlPath
  $startInfo.Arguments = $arguments
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  return [System.Diagnostics.Process]::Start($startInfo)
}

function Start-PsqlSql([string] $sql) {
  $process = New-PsqlProcess (
    "-X --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --quiet"
  )
  $process.StandardInput.Write($sql)
  $process.StandardInput.Close()
  return $process
}

function Wait-Psql($process, [string] $outputPrefix = "") {
  $stdout = $outputPrefix + $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
  }
}

function Wait-OutputSentinel($process, [string] $sentinel) {
  $prefix = ""
  while ($true) {
    $line = $process.StandardOutput.ReadLine()
    if ($null -eq $line) {
      $stderr = $process.StandardError.ReadToEnd()
      $process.WaitForExit()
      throw "Lock session ended before its sentinel (exit $($process.ExitCode))."
    }
    $prefix += $line + [Environment]::NewLine
    if ($line.Trim() -eq $sentinel) {
      return $prefix
    }
  }
}

function Invoke-PsqlFile([string] $path) {
  $process = New-PsqlProcess (
    "-X --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --quiet -f `"$path`""
  )
  $process.StandardInput.Close()
  $result = Wait-Psql $process
  if ($result.ExitCode -ne 0) {
    throw "Database fixture failed with exit $($result.ExitCode)."
  }
  return $result.Stdout.Trim()
}

function Invoke-PsqlSql([string] $sql) {
  $result = Wait-Psql (Start-PsqlSql $sql)
  if ($result.ExitCode -ne 0) {
    throw "Database assertion query failed with exit $($result.ExitCode)."
  }
  return $result.Stdout.Trim()
}

$blockerSql = @"
\set VERBOSITY verbose
set role postgres;
begin;
select id from public.poll_eligible_voters
where id = '$eligibilityId'
for update;
\echo LOCKED
select pg_catalog.pg_sleep(4);
commit;
"@

$identicalVoteSql = @'
\set VERBOSITY verbose
set role postgres;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"feature-c-concurrency-player"}',
  false
) as ignored \gset
select public.cast_poll_ballot(
  'c7000000-0000-4000-8000-000000000001',
  0,
  array['c7100000-0000-4000-8000-000000000001'::uuid]
);
'@

$conflictingVoteTwoSql = @'
\set VERBOSITY verbose
set role postgres;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"feature-c-concurrency-player"}',
  false
) as ignored \gset
select public.cast_poll_ballot(
  'c7000000-0000-4000-8000-000000000001',
  1,
  array['c7100000-0000-4000-8000-000000000002'::uuid]
);
'@

$conflictingVoteThreeSql = @'
\set VERBOSITY verbose
set role postgres;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"feature-c-concurrency-player"}',
  false
) as ignored \gset
select public.cast_poll_ballot(
  'c7000000-0000-4000-8000-000000000001',
  1,
  array['c7100000-0000-4000-8000-000000000003'::uuid]
);
'@

$readStateSql = @'
set role postgres;
select eligible.ballot_revision::text || '|' ||
  count(choice.option_id)::text || '|' ||
  coalesce(string_agg(choice.option_id::text, ',' order by choice.option_id), '')
from public.poll_eligible_voters as eligible
left join public.poll_ballot_choices as choice
  on choice.eligible_voter_id = eligible.id
where eligible.id = 'c7200000-0000-4000-8000-000000000001'
group by eligible.ballot_revision;
'@

$setupCompleted = $false
$cleanupPassed = $false
$phase = "setup"
$failureMessage = $null
$summary = [ordered]@{
  identical_serialized = $false
  conflicting_serialized = $false
  close_boundary_rejected = $false
  cleanup_passed = $false
}

try {
  $setupOutput = Invoke-PsqlFile $setupPath
  if ($setupOutput -notmatch "feature_c_concurrency_ready") {
    throw "Concurrency setup did not return its readiness marker."
  }
  $setupCompleted = $true

  $phase = "identical ballots"
  $blocker = Start-PsqlSql $blockerSql
  $blockerPrefix = Wait-OutputSentinel $blocker "LOCKED"
  $identicalA = Start-PsqlSql $identicalVoteSql
  $identicalB = Start-PsqlSql $identicalVoteSql
  $identicalResultA = Wait-Psql $identicalA
  $identicalResultB = Wait-Psql $identicalB
  $blockerResult = Wait-Psql $blocker $blockerPrefix

  if ($blockerResult.ExitCode -ne 0 -or
      $identicalResultA.ExitCode -ne 0 -or
      $identicalResultB.ExitCode -ne 0) {
    throw "Concurrent identical ballot sessions did not all complete."
  }

  $identicalOutput = $identicalResultA.Stdout + $identicalResultB.Stdout
  if (([regex]::Matches($identicalOutput, '"ballot_revision"\s*:\s*1')).Count -ne 2 -or
      ([regex]::Matches($identicalOutput, '"idempotent"\s*:\s*false')).Count -ne 1 -or
      ([regex]::Matches($identicalOutput, '"idempotent"\s*:\s*true')).Count -ne 1) {
    throw "Concurrent identical ballots did not resolve as one write and one idempotent retry."
  }

  $stateAfterIdentical = Invoke-PsqlSql $readStateSql
  if ($stateAfterIdentical -ne "1|1|c7100000-0000-4000-8000-000000000001") {
    throw "Concurrent identical ballots did not persist exactly one revision-one choice."
  }
  $summary.identical_serialized = $true

  $phase = "conflicting ballots"
  $blocker = Start-PsqlSql $blockerSql
  $blockerPrefix = Wait-OutputSentinel $blocker "LOCKED"
  $conflictingA = Start-PsqlSql $conflictingVoteTwoSql
  $conflictingB = Start-PsqlSql $conflictingVoteThreeSql
  $conflictingResultA = Wait-Psql $conflictingA
  $conflictingResultB = Wait-Psql $conflictingB
  $blockerResult = Wait-Psql $blocker $blockerPrefix

  $successes = @(
    @($conflictingResultA, $conflictingResultB) |
      Where-Object { $_.ExitCode -eq 0 }
  )
  $conflicts = @(
    @($conflictingResultA, $conflictingResultB) |
      Where-Object { $_.ExitCode -ne 0 -and $_.Stderr -match "40001" }
  )
  if ($blockerResult.ExitCode -ne 0 -or
      $successes.Count -ne 1 -or
      $conflicts.Count -ne 1 -or
      $successes[0].Stdout -notmatch '"ballot_revision"\s*:\s*2') {
    throw (
      "Concurrent conflicting ballots did not resolve as one revision-two " +
      "write and one 40001 conflict " +
      "(blocker=$($blockerResult.ExitCode), " +
      "a_exit=$($conflictingResultA.ExitCode), " +
      "a_conflict=$($conflictingResultA.Stderr -match '40001'), " +
      "a_revision_two=$($conflictingResultA.Stdout -match '"ballot_revision"\s*:\s*2'), " +
      "b_exit=$($conflictingResultB.ExitCode), " +
      "b_conflict=$($conflictingResultB.Stderr -match '40001'), " +
      "b_revision_two=$($conflictingResultB.Stdout -match '"ballot_revision"\s*:\s*2'))."
    )
  }

  $stateAfterConflict = Invoke-PsqlSql $readStateSql
  if ($stateAfterConflict -notmatch '^2\|1\|c7100000-0000-4000-8000-00000000000[23]$') {
    throw "Concurrent conflicting ballots did not persist one authoritative choice."
  }
  $summary.conflicting_serialized = $true

  $phase = "close-boundary setup"
  $closeSetupSql = @'
set role postgres;
begin;
alter table public.polls disable trigger polls_published_configuration_guard;
update public.polls
set published_at = pg_catalog.clock_timestamp() - interval '16 minutes',
  opens_at = pg_catalog.clock_timestamp() - interval '15 minutes',
  closes_at = pg_catalog.clock_timestamp() + interval '10 seconds'
where id = 'c7000000-0000-4000-8000-000000000001';
alter table public.polls enable trigger polls_published_configuration_guard;
commit;
'@
  [void] (Invoke-PsqlSql $closeSetupSql)

  $phase = "close-boundary lock wait"
  $closeBlockerSql = @"
\set VERBOSITY verbose
set role postgres;
begin;
select id from public.poll_eligible_voters
where id = '$eligibilityId'
for update;
\echo LOCKED
select pg_catalog.pg_sleep(14);
commit;
"@
  $closeVoteSql = @'
\set VERBOSITY verbose
set role postgres;
set application_name = 'feature-c-close-waiter';
select case
  when pg_catalog.clock_timestamp() < closes_at then 'BEFORE_CLOSE'
  else 'MISSED_CLOSE'
end
from public.polls
where id = 'c7000000-0000-4000-8000-000000000001';
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"feature-c-concurrency-player"}',
  false
) as ignored \gset
select public.cast_poll_ballot(
  'c7000000-0000-4000-8000-000000000001',
  2,
  array['c7100000-0000-4000-8000-000000000001'::uuid]
);
'@

  $closeBlocker = Start-PsqlSql $closeBlockerSql
  $closePrefix = Wait-OutputSentinel $closeBlocker "LOCKED"
  $closeVote = Start-PsqlSql $closeVoteSql
  $closeVotePrefix = Wait-OutputSentinel $closeVote "BEFORE_CLOSE"
  $waitEvidenceSql = @'
set role postgres;
do $$
declare
  v_attempt integer;
begin
  for v_attempt in 1..40 loop
    if exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = 'feature-c-close-waiter'
        and wait_event_type = 'Lock'
    ) then
      return;
    end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'Close-boundary voter did not reach a database lock wait';
end;
$$;
select 'LOCK_WAIT_CONFIRMED';
'@
  $waitEvidence = Invoke-PsqlSql $waitEvidenceSql
  if ($waitEvidence -notmatch "LOCK_WAIT_CONFIRMED") {
    throw "Close-boundary lock-wait evidence was not returned."
  }
  $closeVoteResult = Wait-Psql $closeVote $closeVotePrefix
  $closeBlockerResult = Wait-Psql $closeBlocker $closePrefix

  if ($closeBlockerResult.ExitCode -ne 0 -or
      $closeVoteResult.ExitCode -eq 0 -or
      $closeVoteResult.Stdout -notmatch "BEFORE_CLOSE" -or
      $closeVoteResult.Stderr -notmatch "42501") {
    throw "A ballot waiting across closes_at was not rejected deterministically."
  }

  $stateAfterClose = Invoke-PsqlSql $readStateSql
  if ($stateAfterClose -ne $stateAfterConflict) {
    throw "Close-boundary rejection changed the authoritative ballot."
  }
  $summary.close_boundary_rejected = $true
}
catch {
  $failureMessage = $_.Exception.Message
}
finally {
  try {
    $cleanupOutput = Invoke-PsqlFile $cleanupPath
    $cleanupPassed = $cleanupOutput -match "feature_c_concurrency_clean"
    if (-not $cleanupPassed) {
      throw "Concurrency cleanup did not return its clean marker."
    }
  }
  finally {
    $summary.cleanup_passed = $cleanupPassed
  }
}

if ($null -ne $failureMessage) {
  throw "Feature C concurrency phase '$phase' failed: $failureMessage"
}

$summary | ConvertTo-Json
