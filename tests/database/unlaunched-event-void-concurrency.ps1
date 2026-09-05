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
  throw "The concurrency harness accepts loopback PostgreSQL only."
}
if ($DatabaseName -notmatch "^ironclad_void_[a-zA-Z0-9_]+$") {
  throw "The concurrency harness requires a disposable ironclad_void_* database."
}
if ($UserName -ne "postgres") {
  throw "The concurrency harness requires the disposable local postgres owner."
}

$setupPath = Join-Path $PSScriptRoot "unlaunched-event-void-concurrency-setup.sql"
$cleanupPath = Join-Path $PSScriptRoot "unlaunched-event-void-concurrency-cleanup.sql"

function New-PsqlProcess {
  param(
    [string] $Sql,
    [string] $FilePath,
    [string] $ApplicationName = "ironclad-unlaunched-void-concurrency"
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = (Resolve-Path -LiteralPath $PsqlPath).Path
  $startInfo.WorkingDirectory = $PSScriptRoot
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
      "-d", $DatabaseName
    )) {
    [void] $startInfo.ArgumentList.Add($argument)
  }

  if (-not [string]::IsNullOrWhiteSpace($FilePath)) {
    [void] $startInfo.ArgumentList.Add("-f")
    [void] $startInfo.ArgumentList.Add($FilePath)
  } else {
    [void] $startInfo.ArgumentList.Add("-c")
    [void] $startInfo.ArgumentList.Add($Sql)
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

    [int] $TimeoutMilliseconds = 15000
  )

  if (-not $Request.Process.WaitForExit($TimeoutMilliseconds)) {
    try {
      $Request.Process.Kill($true)
    } catch {
      $Request.Process.Kill()
    }
    throw "A local PostgreSQL race session exceeded its bounded timeout."
  }

  $stdout = $Request.StandardOutput.GetAwaiter().GetResult()
  $stderr = $Request.StandardError.GetAwaiter().GetResult()
  return [pscustomobject]@{
    ExitCode = $Request.Process.ExitCode
    StandardOutput = $stdout
    StandardError = $stderr
    CombinedOutput = $stdout + [Environment]::NewLine + $stderr
  }
}

function Invoke-Psql {
  param(
    [string] $Sql,
    [string] $FilePath,
    [int] $TimeoutMilliseconds = 15000
  )

  return Complete-PsqlProcess `
    -Request (New-PsqlProcess -Sql $Sql -FilePath $FilePath) `
    -TimeoutMilliseconds $TimeoutMilliseconds
}

function Assert-PsqlSuccess {
  param(
    [Parameter(Mandatory = $true)]
    $Result,

    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  if ($Result.ExitCode -ne 0) {
    throw "$Label failed in the disposable local database."
  }
}

function Wait-ForSentinel {
  param([long] $LockKey)

  for ($attempt = 1; $attempt -le 120; $attempt += 1) {
    $result = Invoke-Psql -Sql (
      "select public.unlaunched_void_test_advisory_lock_is_held($LockKey);"
    ) -FilePath "" -TimeoutMilliseconds 5000
    Assert-PsqlSuccess -Result $result -Label "Race sentinel read"
    if ($result.StandardOutput.Trim() -eq "t") {
      return
    }
    Start-Sleep -Milliseconds 50
  }
  throw "The expected cross-session lock sentinel was not observed."
}

function Wait-ForContenderBlocked {
  param([string] $ApplicationName)

  if ($ApplicationName -notmatch "^[a-z0-9-]+$") {
    throw "Invalid local race application name."
  }

  for ($attempt = 1; $attempt -le 100; $attempt += 1) {
    $result = Invoke-Psql -Sql (@"
select exists (
  select 1
  from pg_catalog.pg_stat_activity as activity
  where activity.application_name = '$ApplicationName'
    and activity.pid <> pg_catalog.pg_backend_pid()
    and activity.state = 'active'
    and activity.wait_event_type = 'Lock'
    and pg_catalog.cardinality(
      pg_catalog.pg_blocking_pids(activity.pid)
    ) > 0
);
"@) -FilePath "" -TimeoutMilliseconds 5000
    Assert-PsqlSuccess -Result $result -Label "Contender lock-state read"
    if ($result.StandardOutput.Trim() -eq "t") {
      return
    }
    Start-Sleep -Milliseconds 50
  }

  throw "The contender was not observed blocked behind the Void locks."
}

function Invoke-VoidRace {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,

    [Parameter(Mandatory = $true)]
    [long] $LockKey,

    [Parameter(Mandatory = $true)]
    [string] $OperationSql,

    [Parameter(Mandatory = $true)]
    [string] $VoidSql,

    [Parameter(Mandatory = $true)]
    [string] $StateSql
  )

  $operation = New-PsqlProcess -Sql $OperationSql -FilePath ""
  Wait-ForSentinel -LockKey $LockKey

  $voidResult = Invoke-Psql `
    -Sql $VoidSql `
    -FilePath "" `
    -TimeoutMilliseconds 10000
  $operationResult = Complete-PsqlProcess `
    -Request $operation `
    -TimeoutMilliseconds 15000

  Assert-PsqlSuccess -Result $operationResult -Label "$Name contender"
  if ($voidResult.ExitCode -eq 0) {
    throw "$Name allowed Void to cross an in-flight authority."
  }
  if ($voidResult.CombinedOutput -notmatch "55P03") {
    throw "$Name did not surface the expected retryable 55P03 lock result."
  }
  if (
    ($voidResult.CombinedOutput + $operationResult.CombinedOutput) -match
      "40P01|57014|deadlock detected|statement timeout|lock timeout"
  ) {
    throw "$Name encountered a deadlock or timeout."
  }

  $stateResult = Invoke-Psql `
    -Sql $StateSql `
    -FilePath "" `
    -TimeoutMilliseconds 5000
  Assert-PsqlSuccess -Result $stateResult -Label "$Name final-state read"
  if ($stateResult.StandardOutput.Trim() -ne "t") {
    throw "$Name produced an incoherent final state."
  }

  return [pscustomobject]@{
    race = $Name
    voidSqlState = "55P03"
    operationSucceeded = $true
    deadlock = $false
    timeout = $false
    finalStateCoherent = $true
  }
}

function Invoke-VoidFirstRace {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,

    [Parameter(Mandatory = $true)]
    [long] $LockKey,

    [Parameter(Mandatory = $true)]
    [string] $VoidOperationSql,

    [Parameter(Mandatory = $true)]
    [string] $ContenderSql,

    [Parameter(Mandatory = $true)]
    [string] $ExpectedFailurePattern,

    [Parameter(Mandatory = $true)]
    [string] $StateSql
  )

  $voidOperation = New-PsqlProcess -Sql $VoidOperationSql -FilePath ""
  Wait-ForSentinel -LockKey $LockKey

  $contenderApplicationName =
    "ironclad-unlaunched-void-contender-$LockKey"
  $contender = New-PsqlProcess `
    -Sql $ContenderSql `
    -FilePath "" `
    -ApplicationName $contenderApplicationName

  $barrierFailure = $null
  try {
    Wait-ForContenderBlocked -ApplicationName $contenderApplicationName
  } catch {
    $barrierFailure = $_
  }

  $voidResult = Complete-PsqlProcess `
    -Request $voidOperation `
    -TimeoutMilliseconds 15000
  $contenderResult = Complete-PsqlProcess `
    -Request $contender `
    -TimeoutMilliseconds 15000

  if ($null -ne $barrierFailure) {
    throw $barrierFailure
  }

  Assert-PsqlSuccess -Result $voidResult -Label "$Name Void winner"
  if ($contenderResult.ExitCode -eq 0) {
    throw "$Name allowed the competing authority to cross a completed Void."
  }
  if ($contenderResult.CombinedOutput -notmatch $ExpectedFailurePattern) {
    throw (
      "$Name did not surface the expected terminal refusal. " +
      $contenderResult.CombinedOutput.Trim()
    )
  }
  if (
    ($voidResult.CombinedOutput + $contenderResult.CombinedOutput) -match
      "40P01|57014|deadlock detected|statement timeout|lock timeout"
  ) {
    throw "$Name encountered a deadlock or timeout."
  }

  $stateResult = Invoke-Psql `
    -Sql $StateSql `
    -FilePath "" `
    -TimeoutMilliseconds 5000
  Assert-PsqlSuccess -Result $stateResult -Label "$Name final-state read"
  if ($stateResult.StandardOutput.Trim() -ne "t") {
    throw "$Name produced an incoherent final state."
  }

  $contenderSqlState = [regex]::Match(
    $contenderResult.CombinedOutput,
    "ERROR:\s+([0-9A-Z]{5}):"
  ).Groups[1].Value

  return [pscustomobject]@{
    race = $Name
    voidSucceeded = $true
    contenderRejected = $true
    contenderSqlState = $contenderSqlState
    expectedFailureObserved = $true
    deadlock = $false
    timeout = $false
    finalStateCoherent = $true
  }
}

$identitySql = @'
select current_database()
  || '|'
  || coalesce(pg_catalog.host(pg_catalog.inet_server_addr()), 'local-socket');
'@

$protectedCountSql = @'
select
  (select count(*) from public.player_badge_awards)::text || '|'
  || (select count(*) from public.player_badge_reveals)::text || '|'
  || (
    select count(*)
    from public.notifications
    where type = 'badge.unlocked'
  )::text || '|'
  || (select count(*) from public.leaderboard_point_events)::text || '|'
  || (
    select count(*)
    from public.leaderboard_tournament_season_memberships
  )::text || '|'
  || (select count(*) from public.leaderboard_seasons)::text || '|'
  || (
    select count(*)
    from ironclad_private.badge_reconciliation_targets
  )::text;
'@

$commonSessionSql = @'
set role postgres;
set lock_timeout = '15s';
set statement_timeout = '25s';
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"test:unlaunched-void-concurrency"}';
'@

$failure = $null
$results = @()

try {
  $identity = Invoke-Psql -Sql $identitySql -FilePath ""
  Assert-PsqlSuccess -Result $identity -Label "Local database identity gate"
  $identityParts = $identity.StandardOutput.Trim() -split '\|'
  if (
    $identityParts.Count -ne 2 -or
    $identityParts[0] -ne $DatabaseName -or
    $identityParts[1] -notin @("127.0.0.1", "::1", "local-socket")
  ) {
    throw "The connected PostgreSQL identity is not the approved local target."
  }

  $setup = Invoke-Psql `
    -Sql "" `
    -FilePath $setupPath `
    -TimeoutMilliseconds 30000
  Assert-PsqlSuccess -Result $setup -Label "Concurrency setup"

  $protectedBeforeResult = Invoke-Psql -Sql $protectedCountSql -FilePath ""
  Assert-PsqlSuccess `
    -Result $protectedBeforeResult `
    -Label "Protected-state baseline"
  $protectedBefore = $protectedBeforeResult.StandardOutput.Trim()

  $registrationOperation = $commonSessionSql + @'
select public.unlaunched_void_test_review_with_pause(
  'e2300000-0000-4000-8000-000000000001',
  921001,
  4000
);
'@
  $registrationVoid = $commonSessionSql + @'
select public.void_tournament(
  'e2100000-0000-4000-8000-000000000001',
  'Rollback-only registration race',
  'test:unlaunched-void-concurrency'
);
'@
  $registrationState = @'
select exists (
  select 1
  from public.tournaments as tournament
  join public.registrations as registration
    on registration.tournament_id = tournament.id
  where tournament.id = 'e2100000-0000-4000-8000-000000000001'
    and tournament.status = 'registration_open'
    and tournament.terminal_at is null
    and registration.id = 'e2300000-0000-4000-8000-000000000001'
    and registration.registration_status = 'rejected'
    and registration.waitlist_offer_status = 'cancelled'
    and registration.waitlist_offer_resolved_at is not null
);
'@
  $results += Invoke-VoidRace `
    -Name "registration-vs-Void" `
    -LockKey 921001 `
    -OperationSql $registrationOperation `
    -VoidSql $registrationVoid `
    -StateSql $registrationState

  $generationOperation = $commonSessionSql + @'
select public.unlaunched_void_test_generate_with_pause(
  'e2200000-0000-4000-8000-000000000002',
  921002,
  4000
);
'@
  $generationVoid = $commonSessionSql + @'
select public.void_tournament(
  'e2100000-0000-4000-8000-000000000002',
  'Rollback-only generation race',
  'test:unlaunched-void-concurrency'
);
'@
  $generationState = @'
select exists (
  select 1
  from public.tournaments as tournament
  join public.tournament_brackets as bracket
    on bracket.tournament_id = tournament.id
  join public.generated_brackets as generated
    on generated.tournament_bracket_id = bracket.id
  where tournament.id = 'e2100000-0000-4000-8000-000000000002'
    and tournament.status = 'registration_open'
    and tournament.terminal_at is null
    and bracket.id = 'e2200000-0000-4000-8000-000000000002'
    and bracket.launched_at is null
);
'@
  $results += Invoke-VoidRace `
    -Name "generation-vs-Void" `
    -LockKey 921002 `
    -OperationSql $generationOperation `
    -VoidSql $generationVoid `
    -StateSql $generationState

  $launchOperation = $commonSessionSql + @'
select public.unlaunched_void_test_launch_with_pause(
  'e2200000-0000-4000-8000-000000000003',
  921003,
  4000
);
'@
  $launchVoid = $commonSessionSql + @'
select public.void_tournament(
  'e2100000-0000-4000-8000-000000000003',
  'Rollback-only launch race',
  'test:unlaunched-void-concurrency'
);
'@
  $launchState = @'
select exists (
  select 1
  from public.tournaments as tournament
  join public.tournament_brackets as bracket
    on bracket.tournament_id = tournament.id
  join public.generated_brackets as generated
    on generated.tournament_bracket_id = bracket.id
  where tournament.id = 'e2100000-0000-4000-8000-000000000003'
    and tournament.status = 'in_progress'
    and tournament.terminal_at is null
    and bracket.id = 'e2200000-0000-4000-8000-000000000003'
    and bracket.launched_at is not null
    and generated.competition_locked_at is not null
);
'@
  $results += Invoke-VoidRace `
    -Name "launch-vs-Void" `
    -LockKey 921003 `
    -OperationSql $launchOperation `
    -VoidSql $launchVoid `
    -StateSql $launchState

  $registrationInverseVoid = $commonSessionSql + @'
select public.unlaunched_void_test_void_with_pause(
  'e2100000-0000-4000-8000-000000000004',
  921004,
  8000
);
'@
  $registrationInverseContender = $commonSessionSql + @'
select *
from public.submit_verified_player_registration(
  'e2000000-0000-4000-8000-000000000018',
  'unlaunched-void-concurrency-player-18',
  '76561198000092018',
  'e2100000-0000-4000-8000-000000000004',
  'e2200000-0000-4000-8000-000000000004',
  1000,
  'US Forces',
  'Academy',
  'unlaunched-void-concurrency-v1',
  'e2400000-0000-4000-8000-000000000001',
  'e2400000-0000-4000-8000-000000000002',
  'e2400000-0000-4000-8000-000000000003',
  'e2400000-0000-4000-8000-000000000004',
  true,
  true,
  true,
  true,
  true,
  true,
  false
);
'@
  $registrationInverseState = @'
select exists (
  select 1
  from public.tournaments as tournament
  where tournament.id = 'e2100000-0000-4000-8000-000000000004'
    and tournament.status = 'voided'
    and tournament.terminal_at is not null
)
and not exists (
  select 1
  from public.registrations as registration
  where registration.tournament_id =
    'e2100000-0000-4000-8000-000000000004'
)
and not exists (
  select 1
  from public.registration_acceptances as acceptance
  where acceptance.tournament_id =
    'e2100000-0000-4000-8000-000000000004'
);
'@
  $results += Invoke-VoidFirstRace `
    -Name "Void-first-vs-registration-submission" `
    -LockKey 921004 `
    -VoidOperationSql $registrationInverseVoid `
    -ContenderSql $registrationInverseContender `
    -ExpectedFailurePattern "55000|Terminal tournaments cannot accept competitive mutation|Tournament registration is not available" `
    -StateSql $registrationInverseState

  $generationInverseVoid = $commonSessionSql + @'
select public.unlaunched_void_test_void_with_pause(
  'e2100000-0000-4000-8000-000000000005',
  921005,
  8000
);
'@
  $generationInverseContender = $commonSessionSql + @'
select public.generate_tournament_bracket(
  'e2200000-0000-4000-8000-000000000005',
  'test:unlaunched-void-concurrency'
);
'@
  $generationInverseState = @'
select exists (
  select 1
  from public.tournaments as tournament
  where tournament.id = 'e2100000-0000-4000-8000-000000000005'
    and tournament.status = 'voided'
    and tournament.terminal_at is not null
)
and not exists (
  select 1
  from public.generated_brackets as generated
  where generated.tournament_bracket_id =
    'e2200000-0000-4000-8000-000000000005'
);
'@
  $results += Invoke-VoidFirstRace `
    -Name "Void-first-vs-generation" `
    -LockKey 921005 `
    -VoidOperationSql $generationInverseVoid `
    -ContenderSql $generationInverseContender `
    -ExpectedFailurePattern "Bracket regeneration blocked because result activity exists" `
    -StateSql $generationInverseState

  $launchInverseVoid = $commonSessionSql + @'
select public.unlaunched_void_test_void_with_pause(
  'e2100000-0000-4000-8000-000000000006',
  921006,
  8000
);
'@
  $launchInverseContender = $commonSessionSql + @'
select *
from public.launch_tournament_division(
  'e2200000-0000-4000-8000-000000000006',
  'test:unlaunched-void-concurrency'
);
'@
  $launchInverseState = @'
select exists (
  select 1
  from public.tournaments as tournament
  join public.tournament_brackets as bracket
    on bracket.tournament_id = tournament.id
  where tournament.id = 'e2100000-0000-4000-8000-000000000006'
    and tournament.status = 'voided'
    and tournament.terminal_at is not null
    and bracket.id = 'e2200000-0000-4000-8000-000000000006'
    and bracket.launched_at is null
)
and not exists (
  select 1
  from public.generated_brackets as generated
  where generated.tournament_bracket_id =
    'e2200000-0000-4000-8000-000000000006'
);
'@
  $results += Invoke-VoidFirstRace `
    -Name "Void-first-vs-launch" `
    -LockKey 921006 `
    -VoidOperationSql $launchInverseVoid `
    -ContenderSql $launchInverseContender `
    -ExpectedFailurePattern "Division launch requires a complete private bracket" `
    -StateSql $launchInverseState

  $protectedAfterResult = Invoke-Psql -Sql $protectedCountSql -FilePath ""
  Assert-PsqlSuccess `
    -Result $protectedAfterResult `
    -Label "Protected-state final read"
  if ($protectedAfterResult.StandardOutput.Trim() -ne $protectedBefore) {
    throw "Concurrency races changed Badge, Reveal, Badge-notification, point, season, or reconciliation counts."
  }
} catch {
  $failure = $_
} finally {
  try {
    $cleanup = Invoke-Psql `
      -Sql "" `
      -FilePath $cleanupPath `
      -TimeoutMilliseconds 30000
    Assert-PsqlSuccess -Result $cleanup -Label "Concurrency cleanup"
  } catch {
    if ($null -eq $failure) {
      $failure = $_
    } else {
      Write-Warning "Concurrency cleanup also failed; inspect the disposable local database."
    }
  }
}

if ($null -ne $failure) {
  throw $failure
}

[pscustomobject]@{
  target = "$HostName`:$Port/$DatabaseName"
  localOnly = $true
  productionTouched = $false
  stagingTouched = $false
  cleanupSucceeded = $true
  protectedCountsUnchanged = $true
  races = $results
} | ConvertTo-Json -Depth 5
