[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $SupabaseCliPath,

  [Parameter(Mandatory = $true)]
  [string] $EnvironmentPath
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$projectRefPath = Join-Path $projectRoot "supabase/.temp/project-ref"
$setupPath = Join-Path $PSScriptRoot "match-result-concurrency-setup.sql"
$cleanupPath = Join-Path $PSScriptRoot "match-result-concurrency-cleanup.sql"

if (-not (Test-Path -LiteralPath $SupabaseCliPath -PathType Leaf)) {
  throw "Supabase CLI is unavailable."
}
if (-not (Test-Path -LiteralPath $EnvironmentPath -PathType Leaf)) {
  throw "The approved Staging environment file is unavailable."
}
if (-not (Test-Path -LiteralPath $projectRefPath -PathType Leaf) -or
    (Get-Content -LiteralPath $projectRefPath -Raw).Trim() -ne
      "zzbnneprhjicmajpjkdg") {
  throw "The disposable worktree is not linked to the verified Staging project."
}

function Read-EnvironmentValue([string] $name) {
  $prefix = "$name="
  $line = Get-Content -LiteralPath $EnvironmentPath |
    Where-Object { $_.StartsWith($prefix) } |
    Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($line)) {
    throw "Missing required Staging environment name: $name"
  }
  return $line.Substring($prefix.Length).Trim().Trim('"').Trim("'")
}

$supabaseUrl = Read-EnvironmentValue "NEXT_PUBLIC_SUPABASE_URL"
$serviceRoleKey = Read-EnvironmentValue "SUPABASE_SERVICE_ROLE_KEY"
$supabaseUri = [Uri] $supabaseUrl
if ($supabaseUri.Host -ne "zzbnneprhjicmajpjkdg.supabase.co" -or
    [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw "The supplied environment is not the verified Staging project."
}

function New-CliQueryProcess {
  param(
    [string] $Sql,
    [string] $FilePath
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $SupabaseCliPath
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Environment["SUPABASE_TELEMETRY_DISABLED"] = "true"
  foreach ($argument in @("--output-format", "json", "db", "query", "--linked")) {
    [void] $startInfo.ArgumentList.Add($argument)
  }
  if (-not [string]::IsNullOrWhiteSpace($FilePath)) {
    [void] $startInfo.ArgumentList.Add("--file")
    [void] $startInfo.ArgumentList.Add($FilePath)
  } else {
    [void] $startInfo.ArgumentList.Add($Sql)
  }
  return [System.Diagnostics.Process]::Start($startInfo)
}

function Invoke-CliQuery {
  param(
    [string] $Sql,
    [string] $FilePath
  )

  $process = New-CliQueryProcess -Sql $Sql -FilePath $FilePath
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $diagnosticOutput = $stdout + [Environment]::NewLine + $stderr
  if ($process.ExitCode -ne 0 -or
      $diagnosticOutput -match '"_tag"\s*:\s*"Error"') {
    throw "Staging setup, state, or cleanup query failed."
  }
  return $stdout
}

function Read-FirstCliRow([string] $output) {
  $jsonStart = $output.IndexOf("{")
  if ($jsonStart -lt 0) {
    throw "Staging query did not return JSON."
  }
  $payload = $output.Substring($jsonStart) | ConvertFrom-Json
  if ($null -eq $payload.rows -or $payload.rows.Count -lt 1) {
    throw "Staging query returned no rows."
  }
  return $payload.rows[0]
}

function Start-Rpc {
  param(
    [string] $FunctionName,
    [hashtable] $Body
  )

  $json = $Body | ConvertTo-Json -Compress -Depth 5
  $content = [System.Net.Http.StringContent]::new(
    $json,
    [System.Text.Encoding]::UTF8,
    "application/json"
  )
  $requestClient = [System.Net.Http.HttpClient]::new()
  $requestClient.Timeout = [TimeSpan]::FromSeconds(90)
  $requestClient.DefaultRequestHeaders.Add("apikey", $serviceRoleKey)
  $requestClient.DefaultRequestHeaders.Authorization =
    [System.Net.Http.Headers.AuthenticationHeaderValue]::new(
      "Bearer",
      $serviceRoleKey
    )
  $task = $requestClient.PostAsync(
    "$supabaseUrl/rest/v1/rpc/$FunctionName",
    $content
  )
  return [pscustomobject]@{
    Task = $task
    Client = $requestClient
    Content = $content
    Completed = $false
    Result = $null
  }
}

function Wait-Rpc($request) {
  if ($request.Completed) {
    return $request.Result
  }

  try {
    $response = $request.Task.GetAwaiter().GetResult()
    $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $result = [pscustomobject]@{
      IsSuccess = $response.IsSuccessStatusCode
      StatusCode = [int] $response.StatusCode
      Body = $responseBody
    }
    $response.Dispose()
    $request.Completed = $true
    $request.Result = $result
    return $result
  } catch {
    $request.Completed = $true
    throw
  } finally {
    $request.Content.Dispose()
    $request.Client.Dispose()
  }
}

function Invoke-RpcScalar {
  param(
    [string] $FunctionName,
    [hashtable] $Body
  )

  $result = Wait-Rpc (Start-Rpc $FunctionName $Body)
  if (-not $result.IsSuccess) {
    throw "Staging sentinel RPC failed."
  }
  return $result.Body | ConvertFrom-Json
}

function Wait-ForLock([long] $LockKey) {
  for ($attempt = 1; $attempt -le 100; $attempt += 1) {
    $isHeld = Invoke-RpcScalar "p1_test_advisory_lock_is_held" @{
      p_lock_key = $LockKey
    }
    if ($isHeld -eq $true) {
      return
    }
    Start-Sleep -Milliseconds 100
  }
  throw "Expected cross-session advisory sentinel was not observed."
}

function Assert-LockHeld([long] $LockKey) {
  $isHeld = Invoke-RpcScalar "p1_test_advisory_lock_is_held" @{
    p_lock_key = $LockKey
  }
  if ($isHeld -ne $true) {
    throw "The Match blocker released before both contenders were queued."
  }
}

function Assert-NoDeadlockOrTimeout($results) {
  foreach ($result in $results) {
    if ($result.Body -match "40P01|55P03|lock timeout|deadlock detected") {
      throw "A race session encountered a deadlock or lock timeout."
    }
  }
}

function Get-RpcErrorCode($result) {
  if ([string]::IsNullOrWhiteSpace($result.Body)) {
    return "none"
  }
  try {
    $parsed = $result.Body | ConvertFrom-Json
    if ($null -ne $parsed.code -and
        -not [string]::IsNullOrWhiteSpace([string] $parsed.code)) {
      return [string] $parsed.code
    }
  } catch {
    # Only a sanitized code is used for race diagnostics.
  }
  return "unparseable"
}

$raceAStateSql = @'
set role postgres;
select pg_catalog.jsonb_build_object(
  'match_consistent', (
    select status = 'completed'
      and player_one_score = 2
      and player_two_score = 0
      and winner_registration_id =
        'd2000000-0000-4000-8000-000000000001'
      and official_result_submission_id =
        'd7000000-0000-4000-8000-000000000001'
    from public.tournament_matches
    where id = 'd5000000-0000-4000-8000-000000000001'
  ),
  'group_consistent', (
    select status = 'confirmed'
      and finalized_source = 'opponent_confirmation'
      and finalized_at is not null
      and player_one_score = 2
      and player_two_score = 0
      and winner_registration_id =
        'd2000000-0000-4000-8000-000000000001'
    from public.match_result_report_groups
    where id = 'd6000000-0000-4000-8000-000000000001'
  ),
  'submission_approved', (
    select status = 'approved'
    from public.match_result_submissions
    where id = 'd7000000-0000-4000-8000-000000000001'
  ),
  'active_groups', (
    select pg_catalog.count(*)
    from public.match_result_report_groups
    where match_id = 'd5000000-0000-4000-8000-000000000001'
      and finalized_at is null
      and status in ('pending_confirmation', 'disputed', 'under_review')
  ),
  'confirmation_resolved', (
    select pg_catalog.count(*) = 1
      and pg_catalog.bool_and(read_at is not null)
    from public.notifications
    where report_group_id = 'd6000000-0000-4000-8000-000000000001'
      and type = 'match.confirmation_required'
  )
) as state;
'@

$raceBStateSql = @'
set role postgres;
select pg_catalog.jsonb_build_object(
  'match_unresolved', (
    select status = 'pending_review'
      and winner_registration_id is null
      and player_one_score is null
      and player_two_score is null
      and official_result_decided_at is null
    from public.tournament_matches
    where id = 'd5000000-0000-4000-8000-000000000002'
  ),
  'active_no_show_groups', (
    select pg_catalog.count(*)
    from public.match_result_report_groups
    where match_id = 'd5000000-0000-4000-8000-000000000002'
      and result_type = 'no_show'
      and status = 'pending_confirmation'
      and finalized_at is null
  ),
  'canonical_notifications', (
    select pg_catalog.count(*)
    from public.notifications
    where match_id = 'd5000000-0000-4000-8000-000000000002'
      and type = 'match.no_show_reported'
      and event_key like
        'match:d5000000-0000-4000-8000-000000000002:report-group:%:no-show-reported'
  )
) as state;
'@

$setupCompleted = $false
$cleanupPassed = $false
$activeRequests = New-Object System.Collections.Generic.List[object]
$phase = "setup"
$failureMessage = $null
$summary = [ordered]@{
  player_confirmation_won = $false
  stale_admin_rejected = $false
  player_no_show_won = $false
  direct_admin_rejected = $false
  cleanup_passed = $false
}

try {
  $setupOutput = Invoke-CliQuery -FilePath $setupPath
  $setupCompleted = $true
  if ($setupOutput -notmatch
      "p1_match_result_concurrency_ready") {
    throw "Concurrency setup did not return its readiness marker."
  }

  $phase = "Race A"
  $blocker = Start-Rpc "p1_test_hold_match_lock" @{
    p_match_id = "d5000000-0000-4000-8000-000000000001"
    p_lock_key = 608230101
    p_seconds = 6
  }
  [void] $activeRequests.Add($blocker)
  $phase = "Race A blocker sentinel"
  Wait-ForLock 608230101

  $player = Start-Rpc "p1_test_confirm_match_result" @{
    p_report_group_id = "d6000000-0000-4000-8000-000000000001"
    p_confirmed_by = "p1-concurrency-player-two"
    p_lock_key = 608230102
  }
  [void] $activeRequests.Add($player)
  $phase = "Race A Player sentinel"
  Wait-ForLock 608230102

  $admin = Start-Rpc "p1_test_admin_review_match_result" @{
    p_report_group_id = "d6000000-0000-4000-8000-000000000001"
    p_decision = "rejected"
    p_reviewed_by = "p1-concurrency-admin"
    p_review_notes = "Stale Admin rejection must not apply"
    p_lock_key = 608230103
  }
  [void] $activeRequests.Add($admin)
  $phase = "Race A Admin sentinel"
  Wait-ForLock 608230103
  $phase = "Race A queue proof"
  Assert-LockHeld 608230101

  $phase = "Race A outcomes"
  $blockerResult = Wait-Rpc $blocker
  $playerResult = Wait-Rpc $player
  $adminResult = Wait-Rpc $admin
  Assert-NoDeadlockOrTimeout @($blockerResult, $playerResult, $adminResult)
  if (-not $blockerResult.IsSuccess -or
      -not $playerResult.IsSuccess -or
      $adminResult.IsSuccess -or
      $adminResult.StatusCode -ne 409 -or
      $adminResult.Body -notmatch '"code"\s*:\s*"PT409"') {
    throw (
      "Race A did not resolve as Player success and Admin PT409: " +
      "blocker_status=$($blockerResult.StatusCode), " +
      "player_status=$($playerResult.StatusCode), " +
      "player_code=$(Get-RpcErrorCode $playerResult), " +
      "admin_status=$($adminResult.StatusCode), " +
      "admin_code=$(Get-RpcErrorCode $adminResult)."
    )
  }

  $phase = "Race A state"
  $raceAState = (
    Read-FirstCliRow (Invoke-CliQuery -Sql $raceAStateSql)
  ).state
  if (-not $raceAState.match_consistent -or
      -not $raceAState.group_consistent -or
      -not $raceAState.submission_approved -or
      $raceAState.active_groups -ne 0 -or
      -not $raceAState.confirmation_resolved) {
    throw "Race A left inconsistent authoritative state."
  }
  $summary.player_confirmation_won = $true
  $summary.stale_admin_rejected = $true

  $phase = "Race B"
  $blocker = Start-Rpc "p1_test_hold_match_lock" @{
    p_match_id = "d5000000-0000-4000-8000-000000000002"
    p_lock_key = 608230201
    p_seconds = 6
  }
  [void] $activeRequests.Add($blocker)
  $phase = "Race B blocker sentinel"
  Wait-ForLock 608230201

  $player = Start-Rpc "p1_test_submit_no_show" @{
    p_match_id = "d5000000-0000-4000-8000-000000000002"
    p_submitted_by = "p1-concurrency-player-one"
    p_no_show_registration_id =
      "d2000000-0000-4000-8000-000000000002"
    p_notes = "Concurrency no-show report"
    p_lock_key = 608230202
  }
  [void] $activeRequests.Add($player)
  $phase = "Race B Player sentinel"
  Wait-ForLock 608230202

  $admin = Start-Rpc "p1_test_admin_official_result" @{
    p_match_id = "d5000000-0000-4000-8000-000000000002"
    p_player_one_score = 2
    p_player_two_score = 0
    p_winner_registration_id =
      "d2000000-0000-4000-8000-000000000001"
    p_decided_by = "p1-concurrency-admin"
    p_lock_key = 608230203
  }
  [void] $activeRequests.Add($admin)
  $phase = "Race B Admin sentinel"
  Wait-ForLock 608230203
  $phase = "Race B queue proof"
  Assert-LockHeld 608230201

  $phase = "Race B outcomes"
  $blockerResult = Wait-Rpc $blocker
  $playerResult = Wait-Rpc $player
  $adminResult = Wait-Rpc $admin
  Assert-NoDeadlockOrTimeout @($blockerResult, $playerResult, $adminResult)
  if (-not $blockerResult.IsSuccess -or
      -not $playerResult.IsSuccess -or
      $adminResult.IsSuccess -or
      $adminResult.StatusCode -ne 409 -or
      $adminResult.Body -notmatch '"code"\s*:\s*"PT409"') {
    throw (
      "Race B did not resolve as Player success and Admin PT409: " +
      "blocker_status=$($blockerResult.StatusCode), " +
      "player_status=$($playerResult.StatusCode), " +
      "player_code=$(Get-RpcErrorCode $playerResult), " +
      "admin_status=$($adminResult.StatusCode), " +
      "admin_code=$(Get-RpcErrorCode $adminResult)."
    )
  }

  $phase = "Race B state"
  $raceBState = (
    Read-FirstCliRow (Invoke-CliQuery -Sql $raceBStateSql)
  ).state
  if (-not $raceBState.match_unresolved -or
      $raceBState.active_no_show_groups -ne 1 -or
      $raceBState.canonical_notifications -ne 1) {
    throw "Race B left contradictory authoritative state."
  }
  $summary.player_no_show_won = $true
  $summary.direct_admin_rejected = $true
}
catch {
  $failureMessage = $_.Exception.Message
}
finally {
  foreach ($request in $activeRequests) {
    if (-not $request.Completed) {
      try {
        [void] (Wait-Rpc $request)
      } catch {
        # Cleanup still runs after a failed test-only request.
      }
    }
  }
  if ($setupCompleted) {
    try {
      $cleanupOutput = Invoke-CliQuery -FilePath $cleanupPath
      $cleanupPassed = $cleanupOutput -match
        "p1_match_result_concurrency_clean"
    }
    finally {
      $summary.cleanup_passed = $cleanupPassed
    }
  }
  $serviceRoleKey = $null
}

if ($null -ne $failureMessage) {
  throw "P1 match-result concurrency phase '$phase' failed: $failureMessage"
}
if (-not $cleanupPassed) {
  throw "P1 match-result concurrency cleanup was not proven."
}

$summary | ConvertTo-Json
