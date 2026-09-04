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
if ($DatabaseName -notmatch "^ironclad_event_schedule_[a-zA-Z0-9_]+$") {
  throw "The concurrency harness requires a disposable ironclad_event_schedule_* database."
}
if ($UserName -ne "postgres") {
  throw "The concurrency harness requires the disposable local postgres owner."
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

    [int] $TimeoutMilliseconds = 15000
  )

  if (-not $Request.Process.WaitForExit($TimeoutMilliseconds)) {
    try {
      $Request.Process.Kill($true)
    } catch {
      $Request.Process.Kill()
    }
    throw "A local event-save race session exceeded its bounded timeout."
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

    [string] $ApplicationName = "ironclad-event-schedule-control"
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
    throw "$Label failed in the disposable local database."
  }
}

function New-SaveSql {
  param([Parameter(Mandatory = $true)][string] $Slug)

  return @"
select public.save_tournament(
  null,
  'Event save concurrency $Slug',
  '$Slug',
  'Disposable local concurrency evidence.',
  '/images/tournaments/event-scheduling-fixture.jpg',
  null,
  null,
  null,
  null,
  'registration_open',
  '1v1',
  '',
  null,
  null,
  true,
  null,
  'format_a',
  30,
  '[{"name":"Academy","elo_rules":"Below 1100 ELO","max_players":8}]'::jsonb
);
"@
}

$firstApplication = "ironclad-event-schedule-first"
$firstSql = @"
begin;
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('ironclad:ranked-division-cycle:Academy', 0)
);
select pg_catalog.pg_sleep(1.5);
$(New-SaveSql -Slug "event-schedule-concurrency-a")
commit;
"@

$first = New-PsqlProcess -Sql $firstSql -ApplicationName $firstApplication

$lockObserved = $false
for ($attempt = 1; $attempt -le 60; $attempt += 1) {
  $probe = Invoke-Psql -Sql @"
select exists (
  select 1
  from pg_catalog.pg_stat_activity
  where application_name = '$firstApplication'
    and state = 'active'
    and query like '%pg_sleep(1.5)%'
);
"@
  Assert-PsqlSuccess -Result $probe -Label "Concurrency lock probe"
  if ($probe.StandardOutput.Trim() -eq "t") {
    $lockObserved = $true
    break
  }
  Start-Sleep -Milliseconds 50
}

if (-not $lockObserved) {
  [void] (Complete-PsqlProcess -Request $first)
  throw "The first event-save session did not reach the protected lock window."
}

$second = New-PsqlProcess `
  -Sql (New-SaveSql -Slug "event-schedule-concurrency-b") `
  -ApplicationName "ironclad-event-schedule-second"

$firstResult = Complete-PsqlProcess -Request $first
$secondResult = Complete-PsqlProcess -Request $second
Assert-PsqlSuccess -Result $firstResult -Label "First concurrent event save"

if ($secondResult.ExitCode -eq 0 -or $secondResult.StandardError -notmatch "55000") {
  throw "The competing unresolved Academy save did not fail with SQLSTATE 55000."
}

$verification = Invoke-Psql -Sql @"
select
  count(*) filter (
    where tournament.slug in (
      'event-schedule-concurrency-a',
      'event-schedule-concurrency-b'
    )
  ),
  count(*) filter (
    where tournament.status not in ('completed', 'cancelled', 'voided')
  )
from public.tournament_brackets as bracket
join public.tournaments as tournament
  on tournament.id = bracket.tournament_id
where bracket.name = 'Academy';
"@
Assert-PsqlSuccess -Result $verification -Label "Concurrent save verification"

$counts = $verification.StandardOutput.Trim().Split("|")
if ($counts.Count -ne 2 -or $counts[0] -ne "1" -or $counts[1] -ne "1") {
  throw "Concurrent event saves did not converge on one unresolved Academy cycle."
}

[pscustomobject]@{
  firstSucceeded = $true
  secondRejectedWith55000 = $true
  fixtureRows = [int] $counts[0]
  unresolvedAcademyCycles = [int] $counts[1]
  database = $DatabaseName
  productionTouched = $false
} | ConvertTo-Json
