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
  throw "The Not Held concurrency harness accepts loopback PostgreSQL only."
}
if ($DatabaseName -notmatch "^ironclad_not_held_[a-zA-Z0-9_]+$") {
  throw "The harness requires a disposable ironclad_not_held_* database."
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

    [int] $TimeoutMilliseconds = 15000
  )

  if (-not $Request.Process.WaitForExit($TimeoutMilliseconds)) {
    try {
      $Request.Process.Kill($true)
    } catch {
      $Request.Process.Kill()
    }
    throw "A local Not Held race session exceeded its bounded timeout."
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

    [string] $ApplicationName = "ironclad-not-held-control"
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
    $detail = $Result.StandardError.Trim()
    throw "$Label failed in the disposable local database: $detail"
  }
}

$setup = Invoke-Psql -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency"}';

insert into public.players (
  id, clerk_user_id, display_name, in_game_name, current_elo,
  profile_completed
)
select
  ('f2000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'not-held-concurrency-player-' || number,
  'Not Held Concurrency Player ' || number,
  'NotHeldConcurrency' || number,
  900,
  true
from generate_series(1, 64) as number;

insert into public.tournaments (
  id, title, slug, description, banner_image_url, format, status,
  registration_enabled, prize_pool
)
select
  ('f2100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'Not Held concurrency fixture ' || number,
  'not-held-concurrency-fixture-' || number,
  'Disposable local concurrency fixture.',
  '/fixture.jpg',
  '1v1',
  'registration_open',
  false,
  ''
from generate_series(1, 8) as number;

insert into public.tournament_brackets (
  id, tournament_id, name, elo_rules, max_players
)
select
  ('f2200000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('f2100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'Academy',
  '0-1099',
  8
from generate_series(1, 8) as number;

update public.tournaments
set registration_enabled = true
where slug like 'not-held-concurrency-fixture-%';

set session_replication_role = replica;

insert into public.registrations (
  id, profile_id, clerk_user_id, player_name, submitted_elo,
  tournament_title, bracket_name, registration_status, elo_status,
  admin_notes, tournament_id, tournament_bracket_id, created_at
)
select
  (
    'f2300000-0000-4000-' ||
    lpad(event_number::text, 4, '0') || '-' ||
    lpad(player_number::text, 12, '0')
  )::uuid,
  (
    'f2000000-0000-4000-8000-' ||
    lpad(((event_number - 1) * 8 + player_number)::text, 12, '0')
  )::uuid,
  'not-held-concurrency-player-' || ((event_number - 1) * 8 + player_number),
  'NotHeldConcurrency' || ((event_number - 1) * 8 + player_number),
  900,
  'Not Held concurrency fixture ' || event_number,
  'Academy',
  'pending',
  'pending',
  '',
  ('f2100000-0000-4000-8000-' || lpad(event_number::text, 12, '0'))::uuid,
  ('f2200000-0000-4000-8000-' || lpad(event_number::text, 12, '0'))::uuid,
  clock_timestamp() + player_number * interval '1 millisecond'
from generate_series(1, 8) as event_number
cross join generate_series(1, 7) as player_number;

update public.registrations
set registration_status = 'waitlisted'
where id = 'f2300000-0000-4000-0005-000000000007';

set session_replication_role = origin;
"@
Assert-PsqlSuccess -Result $setup -Label "Concurrency fixture setup"

function Invoke-ClosureRace {
  param(
    [Parameter(Mandatory = $true)]
    [int] $RaceNumber,

    [Parameter(Mandatory = $true)]
    [string] $CompetingSql,

    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  $suffix = $RaceNumber.ToString().PadLeft(12, "0")
  $tournamentId = "f2100000-0000-4000-8000-$suffix"
  $bracketId = "f2200000-0000-4000-8000-$suffix"
  $firstApplication = "ironclad-not-held-close-$RaceNumber"
  $firstSql = @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency"}';
select id from public.tournaments where id = '$tournamentId' for update;
select id from public.tournament_brackets where id = '$bracketId' for update;
select pg_catalog.pg_sleep(1.5);
select public.close_tournament_division_without_launch(
  '$bracketId',
  'minimum_roster_not_reached',
  'Disposable local $Label race',
  'test:not-held-concurrency'
);
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
    Assert-PsqlSuccess -Result $probe -Label "$Label lock probe"
    if ($probe.StandardOutput.Trim() -eq "t") {
      $lockObserved = $true
      break
    }
    Start-Sleep -Milliseconds 50
  }

  if (-not $lockObserved) {
    [void] (Complete-PsqlProcess -Request $first)
    throw "$Label closure did not reach the protected lock window."
  }

  $second = New-PsqlProcess `
    -Sql $CompetingSql `
    -ApplicationName "ironclad-not-held-competing-$RaceNumber"
  $firstResult = Complete-PsqlProcess -Request $first
  $secondResult = Complete-PsqlProcess -Request $second
  Assert-PsqlSuccess -Result $firstResult -Label "$Label closure"

  if ($secondResult.ExitCode -eq 0 -or $secondResult.StandardError -notmatch "55000") {
    throw "$Label competing mutation did not fail with SQLSTATE 55000."
  }

  return [pscustomobject]@{
    ClosureSucceeded = $true
    CompetingMutationRejected = $true
  }
}

function Invoke-ClosureIdempotencyRace {
  $raceNumber = 8
  $suffix = $raceNumber.ToString().PadLeft(12, "0")
  $tournamentId = "f2100000-0000-4000-8000-$suffix"
  $bracketId = "f2200000-0000-4000-8000-$suffix"
  $firstApplication = "ironclad-not-held-close-$raceNumber"
  $firstSql = @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency"}';
select id from public.tournaments where id = '$tournamentId' for update;
select id from public.tournament_brackets where id = '$bracketId' for update;
select pg_catalog.pg_sleep(1.5);
select public.close_tournament_division_without_launch(
  '$bracketId',
  'minimum_roster_not_reached',
  'Disposable local concurrent closure race',
  'test:not-held-concurrency'
);
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
    Assert-PsqlSuccess -Result $probe -Label "concurrent closure lock probe"
    if ($probe.StandardOutput.Trim() -eq "t") {
      $lockObserved = $true
      break
    }
    Start-Sleep -Milliseconds 50
  }

  if (-not $lockObserved) {
    [void] (Complete-PsqlProcess -Request $first)
    throw "Concurrent closure did not reach the protected lock window."
  }

  $second = New-PsqlProcess `
    -ApplicationName "ironclad-not-held-competing-$raceNumber" `
    -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency-two"}';
select public.close_tournament_division_without_launch(
  '$bracketId',
  'minimum_roster_not_reached',
  'Disposable local concurrent closure race two',
  'test:not-held-concurrency-two'
);
"@

  $firstResult = Complete-PsqlProcess -Request $first
  $secondResult = Complete-PsqlProcess -Request $second
  Assert-PsqlSuccess -Result $firstResult -Label "first concurrent closure"
  Assert-PsqlSuccess -Result $secondResult -Label "second concurrent closure"

  if ($secondResult.StandardOutput -notmatch '"alreadyNotHeld"\s*:\s*true') {
    throw "The second concurrent closure was not an idempotent success."
  }

  return [pscustomobject]@{
    FirstClosureSucceeded = $true
    SecondClosureDeduplicated = $true
  }
}

$registrationRace = Invoke-ClosureRace `
  -RaceNumber 1 `
  -Label "registration" `
  -CompetingSql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency"}';
insert into public.registrations (
  id, profile_id, clerk_user_id, player_name, submitted_elo,
  tournament_title, bracket_name, registration_status, elo_status,
  admin_notes, tournament_id, tournament_bracket_id
)
values (
  'f2300000-0000-4000-0001-000000000008',
  'f2000000-0000-4000-8000-000000000008',
  'not-held-concurrency-player-8',
  'NotHeldConcurrency8',
  900,
  'Not Held concurrency fixture 1',
  'Academy',
  'pending',
  'pending',
  '',
  'f2100000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000001'
);
"@

$generationRace = Invoke-ClosureRace `
  -RaceNumber 2 `
  -Label "generation" `
  -CompetingSql @"
insert into public.generated_brackets (
  tournament_bracket_id, format, participant_count, slot_count, generated_by
)
values (
  'f2200000-0000-4000-8000-000000000002',
  'single_elimination',
  7,
  8,
  'test:not-held-concurrency'
);
"@

$launchRace = Invoke-ClosureRace `
  -RaceNumber 3 `
  -Label "launch" `
  -CompetingSql @"
begin;
set local ironclad.explicit_division_launch = 'on';
update public.tournament_brackets
set launched_at = clock_timestamp()
where id = 'f2200000-0000-4000-8000-000000000003';
commit;
"@

$mapPublicationRace = Invoke-ClosureRace `
  -RaceNumber 4 `
  -Label "map-pool publication" `
  -CompetingSql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency"}';
select public.publish_tournament_bracket_map_pools(
  'f2100000-0000-4000-8000-000000000004',
  array['f2200000-0000-4000-8000-000000000004'::uuid],
  (
    select array_agg(map.id order by map.id)
    from (
      select id
      from public.coh3_maps
      where status = 'active'
        and game_mode = '1v1'
      order by id
      limit 5
    ) as map
  ),
  'test:not-held-concurrency'
);
"@

$waitlistRace = Invoke-ClosureRace `
  -RaceNumber 5 `
  -Label "waitlist offer" `
  -CompetingSql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:not-held-concurrency"}';
select public.reconcile_tournament_waitlist(
  'f2200000-0000-4000-8000-000000000005'
);
"@

$withdrawalRace = Invoke-ClosureRace `
  -RaceNumber 6 `
  -Label "withdrawal" `
  -CompetingSql @"
set request.jwt.claims = '{"role":"authenticated","sub":"not-held-concurrency-player-41"}';
select *
from public.withdraw_tournament_registration(
  'f2300000-0000-4000-0006-000000000001'
);
"@

$deletionRace = Invoke-ClosureRace `
  -RaceNumber 7 `
  -Label "deletion" `
  -CompetingSql @"
delete from public.tournament_brackets
where id = 'f2200000-0000-4000-8000-000000000007';
"@

$closureRace = Invoke-ClosureIdempotencyRace

$verification = Invoke-Psql -Sql @"
select
  (
    select count(*)
    from public.tournament_division_not_held_closures
    where tournament_bracket_id::text like 'f2200000-0000-4000-8000-%'
  ),
  (
    select count(*)
    from public.registrations
    where tournament_id::text like 'f2100000-0000-4000-8000-%'
  ),
  (
    select count(*)
    from public.generated_brackets
    where tournament_bracket_id::text like 'f2200000-0000-4000-8000-%'
  ),
  (
    select count(*)
    from public.tournament_brackets
    where id::text like 'f2200000-0000-4000-8000-%'
      and launched_at is not null
  ),
  (
    select count(*)
    from public.tournament_bracket_map_pool_entries as entry
    where entry.tournament_bracket_id::text like
      'f2200000-0000-4000-8000-%'
      and entry.removed_at is null
  ),
  (
    select count(*)
    from public.registrations
    where id = 'f2300000-0000-4000-0005-000000000007'
      and waitlist_offer_status is null
  ),
  (
    select count(*)
    from public.registrations
    where id = 'f2300000-0000-4000-0006-000000000001'
      and registration_status = 'pending'
  );
"@
Assert-PsqlSuccess -Result $verification -Label "Concurrency convergence verification"

$counts = $verification.StandardOutput.Trim().Split("|")
if (
  $counts.Count -ne 7 -or
  $counts[0] -ne "8" -or
  $counts[1] -ne "56" -or
  $counts[2] -ne "0" -or
  $counts[3] -ne "0" -or
  $counts[4] -ne "0" -or
  $counts[5] -ne "1" -or
  $counts[6] -ne "1"
) {
  throw "Not Held concurrency races did not converge on the protected terminal state."
}

[pscustomobject]@{
  registrationRace = $registrationRace
  generationRace = $generationRace
  launchRace = $launchRace
  mapPublicationRace = $mapPublicationRace
  waitlistRace = $waitlistRace
  withdrawalRace = $withdrawalRace
  deletionRace = $deletionRace
  concurrentClosureRace = $closureRace
  closureRows = [int] $counts[0]
  registrationsPreserved = [int] $counts[1]
  generatedBrackets = [int] $counts[2]
  launchedDivisions = [int] $counts[3]
  activeMapPoolEntries = [int] $counts[4]
  preventedWaitlistOffers = [int] $counts[5]
  preservedPendingWithdrawal = [int] $counts[6]
  database = $DatabaseName
  productionTouched = $false
} | ConvertTo-Json -Depth 3
