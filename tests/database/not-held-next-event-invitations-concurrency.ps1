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
  throw "The invitation concurrency harness accepts loopback PostgreSQL only."
}
if ($DatabaseName -notmatch "^ironclad_pr9_[a-zA-Z0-9_]+$") {
  throw "The harness requires a disposable ironclad_pr9_* database."
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
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
      "-h", $HostName, "-p", $Port.ToString(), "-U", $UserName,
      "-d", $DatabaseName, "-c", $Sql
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
    try { $Request.Process.Kill($true) } catch { $Request.Process.Kill() }
    throw "A local invitation race session exceeded its bounded timeout."
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
    [string] $ApplicationName = "ironclad-pr9-control"
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
}

function Wait-ForSleep {
  param([Parameter(Mandatory = $true)][string] $ApplicationName)

  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    $probe = Invoke-Psql -Sql @"
select exists (
  select 1 from pg_catalog.pg_stat_activity
  where application_name = '$ApplicationName'
    and state = 'active'
    and query like '%pg_sleep(1.5)%'
);
"@
    Assert-PsqlSuccess -Result $probe -Label "Concurrency lock probe"
    if ($probe.StandardOutput.Trim() -eq "t") { return }
    Start-Sleep -Milliseconds 25
  }

  throw "The expected invitation race lock was not observed."
}

function Add-Target {
  param(
    [string] $TournamentId,
    [string] $BracketId,
    [string] $Suffix,
    [string] $Division
  )

  $eloRules = if ($Division -eq "Academy") { "0-1099" } elseif (
    $Division -eq "Challenge"
  ) { "1100-1399" } else { "1400+" }
  $result = Invoke-Psql -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
insert into public.tournaments (
  id,title,slug,description,banner_image_url,format,status,
  registration_enabled,prize_pool
) values (
  '$TournamentId','PR 9 concurrency $Suffix','pr9-concurrency-$Suffix',
  'Disposable invitation race target.','/fixture.jpg','1v1',
  'registration_open',true,''
);
insert into public.tournament_brackets (
  id,tournament_id,name,elo_rules,max_players
) values ('$BracketId','$TournamentId','$Division','$eloRules',8);
update public.tournaments set registration_enabled=true where id='$TournamentId';
"@
  Assert-PsqlSuccess -Result $result -Label "Create $Suffix target"
}

$setup = Invoke-Psql -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
create table public.pr9_invitation_concurrency_baseline as
select
  (select count(*) from public.player_badge_awards) as badge_awards,
  (select count(*) from public.player_badge_reveals) as badge_reveals,
  (select count(*) from public.notifications where type='badge.unlocked')
    as badge_notifications,
  (select count(*) from public.leaderboard_point_events) as point_events;
set session_replication_role=replica;
insert into public.players (
  id,clerk_user_id,display_name,in_game_name,current_elo,profile_completed
) values
  ('fb000000-0000-4000-8000-000000000001','pr9-race-player-1','Race Player 1','RaceOne',900,true),
  ('fb000000-0000-4000-8000-000000000002','pr9-race-player-2','Race Player 2','RaceTwo',1200,true),
  ('fb000000-0000-4000-8000-000000000003','pr9-race-player-3','Race Player 3','RaceThree',1500,true);
insert into public.tournaments (
  id,title,slug,description,banner_image_url,format,status,
  registration_enabled,prize_pool
) values (
  'fb100000-0000-4000-8000-000000000001','PR 9 race source',
  'pr9-race-source','Disposable Not Held sources.','/fixture.jpg','1v1',
  'registration_open',false,''
);
insert into public.tournament_brackets (
  id,tournament_id,name,elo_rules,max_players
) values
  ('fb200000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','Academy','0-1099',8),
  ('fb200000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000001','Challenge','1100-1399',8),
  ('fb200000-0000-4000-8000-000000000003','fb100000-0000-4000-8000-000000000001','Main','1400+',8);
insert into public.tournament_division_not_held_closures (
  tournament_bracket_id,reason_code,closed_at,closed_by_clerk_user_id,
  active_registration_count,waitlist_registration_count
) values
  ('fb200000-0000-4000-8000-000000000001','minimum_roster_not_reached',clock_timestamp(),'test:pr9-concurrency',1,0),
  ('fb200000-0000-4000-8000-000000000002','minimum_roster_not_reached',clock_timestamp(),'test:pr9-concurrency',1,0),
  ('fb200000-0000-4000-8000-000000000003','minimum_roster_not_reached',clock_timestamp(),'test:pr9-concurrency',1,0);
insert into public.registrations (
  id,profile_id,clerk_user_id,player_name,submitted_elo,tournament_title,
  bracket_name,registration_status,elo_status,admin_notes,tournament_id,
  tournament_bracket_id
) values
  ('fb300000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','pr9-race-player-1','RaceOne',900,'PR 9 race source','Academy','pending','pending','','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001'),
  ('fb300000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000002','pr9-race-player-2','RaceTwo',1200,'PR 9 race source','Challenge','pending','pending','','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000002'),
  ('fb300000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000003','pr9-race-player-3','RaceThree',1500,'PR 9 race source','Main','pending','pending','','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000003');
set session_replication_role=origin;
"@
Assert-PsqlSuccess -Result $setup -Label "Concurrency fixture setup"

# Concurrent duplicate requests converge on one pending row and notification.
Add-Target -TournamentId "fb400000-0000-4000-8000-000000000001" -BracketId "fb500000-0000-4000-8000-000000000001" -Suffix "duplicate" -Division "Academy"
$duplicateSql = @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select public.create_tournament_division_invitation(
  'fb300000-0000-4000-8000-000000000001',
  'fb500000-0000-4000-8000-000000000001','test:pr9-concurrency'
);
"@
$duplicateOne = New-PsqlProcess -Sql $duplicateSql -ApplicationName "pr9-duplicate-one"
$duplicateTwo = New-PsqlProcess -Sql $duplicateSql -ApplicationName "pr9-duplicate-two"
Assert-PsqlSuccess -Result (Complete-PsqlProcess $duplicateOne) -Label "First duplicate request"
Assert-PsqlSuccess -Result (Complete-PsqlProcess $duplicateTwo) -Label "Second duplicate request"
$duplicateProof = Invoke-Psql -Sql @"
select count(*)=1 and count(distinct event_key)=1
from public.tournament_division_invitations i
join public.notifications n
  on n.event_key='division-invitation:' || i.id::text
where i.target_tournament_bracket_id='fb500000-0000-4000-8000-000000000001'
  and i.status='pending';
"@
Assert-PsqlSuccess $duplicateProof "Duplicate proof"
if ($duplicateProof.StandardOutput.Trim() -ne "t") { throw "Duplicate invitation convergence failed." }
$voidDuplicate = Invoke-Psql -Sql "set request.jwt.claims='{""role"":""service_role"",""sub"":""test:pr9-concurrency""}';select public.void_tournament('fb400000-0000-4000-8000-000000000001','Disposable race cleanup','test:pr9-concurrency');"
Assert-PsqlSuccess $voidDuplicate "Duplicate target cleanup"

# Invitation creation committed first, then Not Held invalidates it.
Add-Target -TournamentId "fb400000-0000-4000-8000-000000000002" -BracketId "fb500000-0000-4000-8000-000000000002" -Suffix "not-held" -Division "Academy"
$inviteFirstName = "pr9-invite-before-not-held"
$inviteFirst = New-PsqlProcess -ApplicationName $inviteFirstName -Sql @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select id from public.registrations where id='fb300000-0000-4000-8000-000000000001' for update;
select id from public.players where id='fb000000-0000-4000-8000-000000000001' for update;
select id from public.tournament_brackets where id='fb200000-0000-4000-8000-000000000001' for update;
select id from public.tournaments where id='fb400000-0000-4000-8000-000000000002' for update;
select id from public.tournament_brackets where id='fb500000-0000-4000-8000-000000000002' for update;
select pg_catalog.pg_sleep(1.5);
select public.create_tournament_division_invitation('fb300000-0000-4000-8000-000000000001','fb500000-0000-4000-8000-000000000002','test:pr9-concurrency');
commit;
"@
Wait-ForSleep $inviteFirstName
$notHeld = New-PsqlProcess -ApplicationName "pr9-not-held-second" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select public.close_tournament_division_without_launch('fb500000-0000-4000-8000-000000000002','minimum_roster_not_reached',null,'test:pr9-concurrency');
"@
Assert-PsqlSuccess (Complete-PsqlProcess $inviteFirst) "Invitation-before-Not-Held"
Assert-PsqlSuccess (Complete-PsqlProcess $notHeld) "Concurrent Not Held"

# A target registration committed first makes the concurrent invitation reject.
Add-Target -TournamentId "fb400000-0000-4000-8000-000000000003" -BracketId "fb500000-0000-4000-8000-000000000003" -Suffix "registration" -Division "Challenge"
$registrationFirstName = "pr9-registration-before-invite"
$registrationFirst = New-PsqlProcess -ApplicationName $registrationFirstName -Sql @"
begin;
select id from public.players where id='fb000000-0000-4000-8000-000000000002' for update;
select id from public.tournament_brackets where id='fb500000-0000-4000-8000-000000000003' for update;
select pg_catalog.pg_sleep(1.5);
set local session_replication_role=replica;
insert into public.registrations (id,profile_id,clerk_user_id,player_name,submitted_elo,tournament_title,bracket_name,registration_status,elo_status,admin_notes,tournament_id,tournament_bracket_id)
values ('fb300000-0000-4000-8000-000000000013','fb000000-0000-4000-8000-000000000002','pr9-race-player-2','RaceTwo',1200,'PR 9 concurrency registration','Challenge','pending','pending','','fb400000-0000-4000-8000-000000000003','fb500000-0000-4000-8000-000000000003');
set local session_replication_role=origin;
commit;
"@
Wait-ForSleep $registrationFirstName
$inviteAfterRegistration = New-PsqlProcess -ApplicationName "pr9-invite-after-registration" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select public.create_tournament_division_invitation('fb300000-0000-4000-8000-000000000002','fb500000-0000-4000-8000-000000000003','test:pr9-concurrency');
"@
Assert-PsqlSuccess (Complete-PsqlProcess $registrationFirst) "Concurrent registration"
$registrationInviteResult = Complete-PsqlProcess $inviteAfterRegistration
if ($registrationInviteResult.ExitCode -eq 0 -or $registrationInviteResult.StandardError -notmatch "already has a registration") {
  throw "Concurrent registration did not prevent invitation creation."
}
$voidRegistration = Invoke-Psql -Sql "set request.jwt.claims='{""role"":""service_role"",""sub"":""test:pr9-concurrency""}';select public.void_tournament('fb400000-0000-4000-8000-000000000003','Disposable race cleanup','test:pr9-concurrency');"
Assert-PsqlSuccess $voidRegistration "Registration target cleanup"

# A target launch committed first makes the concurrent invitation reject.
Add-Target -TournamentId "fb400000-0000-4000-8000-000000000004" -BracketId "fb500000-0000-4000-8000-000000000004" -Suffix "launch" -Division "Main"
$launchFirstName = "pr9-launch-before-invite"
$launchFirst = New-PsqlProcess -ApplicationName $launchFirstName -Sql @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select id from public.tournaments where id='fb400000-0000-4000-8000-000000000004' for update;
select id from public.tournament_brackets where id='fb500000-0000-4000-8000-000000000004' for update;
select pg_catalog.pg_sleep(1.5);
set local ironclad.explicit_division_launch='on';
update public.tournaments set status='in_progress',registration_enabled=false where id='fb400000-0000-4000-8000-000000000004';
update public.tournament_brackets set launched_at=clock_timestamp() where id='fb500000-0000-4000-8000-000000000004';
commit;
"@
Wait-ForSleep $launchFirstName
$inviteAfterLaunch = New-PsqlProcess -ApplicationName "pr9-invite-after-launch" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select public.create_tournament_division_invitation('fb300000-0000-4000-8000-000000000003','fb500000-0000-4000-8000-000000000004','test:pr9-concurrency');
"@
Assert-PsqlSuccess (Complete-PsqlProcess $launchFirst) "Concurrent launch"
$launchInviteResult = Complete-PsqlProcess $inviteAfterLaunch
if ($launchInviteResult.ExitCode -eq 0 -or $launchInviteResult.StandardError -notmatch "not accepting registration") {
  throw "Concurrent launch did not prevent invitation creation."
}

# Target lifecycle locks win safely over a concurrent player response. The
# response must not hold the invitation row while waiting for the target.
Add-Target -TournamentId "fb400000-0000-4000-8000-000000000005" -BracketId "fb500000-0000-4000-8000-000000000005" -Suffix "response-launch" -Division "Academy"
$responseInvitation = Invoke-Psql -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select public.create_tournament_division_invitation(
  'fb300000-0000-4000-8000-000000000001',
  'fb500000-0000-4000-8000-000000000005','test:pr9-concurrency'
);
"@
Assert-PsqlSuccess $responseInvitation "Response-versus-launch invitation"
$responseInvitationId = (
  $responseInvitation.StandardOutput.Trim() | ConvertFrom-Json
).invitationId
$responseLaunchName = "pr9-launch-before-response"
$responseLaunch = New-PsqlProcess -ApplicationName $responseLaunchName -Sql @"
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"test:pr9-concurrency"}';
select id from public.tournaments where id='fb400000-0000-4000-8000-000000000005' for update;
select id from public.tournament_brackets where id='fb500000-0000-4000-8000-000000000005' for update;
select pg_catalog.pg_sleep(1.5);
set local ironclad.explicit_division_launch='on';
update public.tournaments set status='in_progress',registration_enabled=false where id='fb400000-0000-4000-8000-000000000005';
update public.tournament_brackets set launched_at=clock_timestamp() where id='fb500000-0000-4000-8000-000000000005';
commit;
"@
Wait-ForSleep $responseLaunchName
$responseDuringLaunch = New-PsqlProcess -ApplicationName "pr9-response-during-launch" -Sql @"
set request.jwt.claims = '{"role":"service_role","sub":"pr9-race-player-1"}';
select public.respond_to_tournament_division_invitation(
  '$responseInvitationId','pr9-race-player-1','accept'
);
"@
Assert-PsqlSuccess (Complete-PsqlProcess $responseLaunch) "Launch-before-response"
$responseDuringLaunchResult = Complete-PsqlProcess $responseDuringLaunch
Assert-PsqlSuccess $responseDuringLaunchResult "Concurrent invitation response"
$responseDuringLaunchProof = $responseDuringLaunchResult.StandardOutput.Trim() |
  ConvertFrom-Json
if ($responseDuringLaunchProof.status -ne "invalidated" -or
    $responseDuringLaunchProof.invalidationReason -ne "target_division_launched") {
  throw "Concurrent response did not converge on launch invalidation."
}

$final = Invoke-Psql -Sql @"
select jsonb_build_object(
  'duplicate_active_count',(
    select count(*) from public.tournament_division_invitations
    where target_tournament_bracket_id='fb500000-0000-4000-8000-000000000001'
  ),
  'not_held_status',(
    select status from public.tournament_division_invitations
    where target_tournament_bracket_id='fb500000-0000-4000-8000-000000000002'
  ),
  'not_held_reason',(
    select invalidation_reason from public.tournament_division_invitations
    where target_tournament_bracket_id='fb500000-0000-4000-8000-000000000002'
  ),
  'registration_invites',(
    select count(*) from public.tournament_division_invitations
    where target_tournament_bracket_id='fb500000-0000-4000-8000-000000000003'
  ),
  'launch_invites',(
    select count(*) from public.tournament_division_invitations
    where target_tournament_bracket_id='fb500000-0000-4000-8000-000000000004'
  ),
  'response_launch_status',(
    select status from public.tournament_division_invitations
    where target_tournament_bracket_id='fb500000-0000-4000-8000-000000000005'
  ),
  'badge_integrity',(
    select row(
      (select count(*) from public.player_badge_awards),
      (select count(*) from public.player_badge_reveals),
      (select count(*) from public.notifications where type='badge.unlocked'),
      (select count(*) from public.leaderboard_point_events)
    ) = row(badge_awards,badge_reveals,badge_notifications,point_events)
    from public.pr9_invitation_concurrency_baseline
  )
);
"@
Assert-PsqlSuccess $final "Final invitation concurrency proof"
$proof = $final.StandardOutput.Trim() | ConvertFrom-Json
if ($proof.duplicate_active_count -ne 1 -or
    $proof.not_held_status -ne "invalidated" -or
    $proof.not_held_reason -ne "target_division_not_held" -or
    $proof.registration_invites -ne 0 -or
    $proof.launch_invites -ne 0 -or
    $proof.response_launch_status -ne "invalidated" -or
    $proof.badge_integrity -ne $true) {
  throw "Invitation concurrency final-state proof failed: $($final.StandardOutput.Trim())"
}

[pscustomobject]@{
  duplicateRequests = "one_pending_one_notification"
  invitationVsNotHeld = "invalidated"
  invitationVsRegistration = "registration_won_no_invitation"
  invitationVsLaunch = "launch_won_no_invitation"
  responseVsLaunch = "launch_won_invalidated_no_deadlock"
  badgeRewardsPreserved = $true
  productionTouched = $false
} | ConvertTo-Json -Compress
