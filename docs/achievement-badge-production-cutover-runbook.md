# Achievement Badge Production cutover runbook

## HOLD and authorization boundaries

**Production historical backfill remains on HOLD.** The approved Badge
application release is complete at Production head
`c6109d85de98f73545209a016c3114d953b8ebba` and application tree
`6ba0e3b2308bd22c3c9dea62efb235f1bb48326c`; it must remain untouched. This
runbook authorizes neither a deployment nor a Production mutation.

The collision-aware tooling revision and its read-only Production preflight
are a review gate only. A green automated test, GitHub/Vercel check, or
`BADGE_BACKFILL_PREFLIGHT_READY` result does **not** authorize `--apply`. After
that evidence is reviewed, the Owner must separately authorize the exact
Production head, tooling head, full two-player population file, pinned live
trio, derived historical execution set, and command before any backfill write.

The one-time operation must call the already approved
`backfillInitialBadgeAwards()` authority with `evaluationMode: "backfill"`.
It must not manually insert or delete Badge awards, change qualification
rules, use reconciliation mode as a historical substitute, create historical
`badge.unlocked` notifications, or pre-create Reveal acknowledgements.

## Frozen release source, current Production head, and operator tooling

PR #88 remains feature-frozen at this exact source/content artifact:

| Artifact field | Required value |
| --- | --- |
| PR | `#88` |
| Release source head | `ac612018f6c27963a59df84815d0a76ebbcbd27e` |
| Approved application tree | `6ba0e3b2308bd22c3c9dea62efb235f1bb48326c` |
| Production head | `c6109d85de98f73545209a016c3114d953b8ebba` |

The operator runner and this runbook are a **separate reviewed local tooling
history** descended from the release source head. The tooling commits are not
part of PR #88, are not merged into the application artifact, and are not
deployed to Vercel. This separation is intentional: Production receives the
approved PR #88 content tree through the normal merge into `master`, while the
operator executes the runner from a clean local checkout of the separately
authorized tooling head.

This tooling history is Draft PR #89 on
`ops/badge-initial-backfill-cutover`. Keep it OPEN, Draft, and unmerged. Revise
it only with normal follow-up commits; never rewrite or force-push its reviewed
history.

`ac612018f6c27963a59df84815d0a76ebbcbd27e` is the PR #88 release source
head. It is **not** the deployed Production SHA. The current `productionHead`
is `c6109d85de98f73545209a016c3114d953b8ebba`; its tree must continue to equal
both the release-source tree and approved application tree.

Before either runner mode, record and verify:

- `releaseSourceHead` is the fixed PR #88 source head above;
- `applicationTree` is the fixed approved tree above;
- `productionHead` is the exact post-merge `origin/master` SHA;
- a fresh fetch proves `origin/master == productionHead`;
- `tree(productionHead) == tree(releaseSourceHead) == applicationTree`;
- the READY canonical Vercel deployment reports
  `gitSource.sha == productionHead`;
- `tooling.head` is the separate 40-character Owner-authorized tooling SHA;
- `toolingBaseHead` is the release source head;
- `merge-base(tooling.head, releaseSourceHead) == releaseSourceHead`;
- the local tooling checkout is at `tooling.head` and has no tracked or
  untracked changes; and
- the reviewed `releaseSourceHead..tooling.head` diff contains exactly these
  four paths and no others:
  `docs/achievement-badge-production-cutover-runbook.md`,
  `scripts/badges/initial-awards-backfill.mjs`,
  `tests/integration/badge-initial-backfill-contract.test.ts`, and
  `tests/unit/badge-initial-backfill-cli.test.ts`.

The runner also explicitly verifies that the pinned Badge authority,
notification, reconciliation, Reveal, and Supabase-admin runtime modules have
no diff from the release source.

The CLI arguments bind the current Production and reviewed tooling heads; the
runner separately pins the release source head and approved application tree:

```text
--target production
--confirm-project-ref nsyjtqpvyxlzyujlbzos
--base-url https://www.ironcladtournaments.com
--expected-production-head <40-character post-merge origin/master SHA>
--expected-tooling-head <40-character reviewed local tooling SHA>
--allowlist-file <absolute path to private JSON>
--allowlist-sha256 <lowercase SHA-256 of the exact file bytes>
--expected-live-award-id <canonical UUID>
--expected-live-notification-id <canonical UUID>
--expected-live-reveal-id <canonical UUID>
--expected-execution-count <positive integer>
--expected-execution-set-sha256 <lowercase SHA-256>
[--apply]
```

The five `--expected-live-*` / `--expected-execution-*` arguments form one
all-or-none collision-aware baseline contract. Omitting any one while
supplying another, duplicating an argument, or supplying a malformed value
must fail before database evaluation. Production's current state requires all
five; an unpinned "one award exists" assertion is never sufficient.

Omitting `--apply` is read-only preflight. Supplying `--apply` is the only
runner mode permitted to create awards. The runner must fail closed if the
post-merge Production identity/tree, Vercel deployment identity, release
source/tree, or local tooling identity/base/diff differs from this contract.

## Collision-aware backfill cutover order

The 18 approved migrations through `20260831134000`, PR #88 merge, and
Production deployment are already complete. Do not rerun, alter, or roll back
them under this tooling authorization. Continue in this order:

1. Reconfirm the exact Production head/tree, READY Vercel deployment SHA,
   migration ceiling, reviewed tooling head/base/four-path diff, and clean
   relevant worktrees.
2. Reconfirm the existing private allowlist is byte-identical and still
   attests the complete two-player legitimate-open population.
3. Read and attest the exact live award, notification, and completed Reveal;
   reject every other non-backfill award.
4. Derive and verify the one-player historical execution set by subtracting
   the attested live player from the full cohort. Never create a separate
   one-player allowlist.
5. Run the exact read-only preflight below using memory-only credentials and
   without `--apply`.
6. Wait for all local, GitHub, and Vercel tooling checks, archive only
   sanitized evidence, and stop.
7. Return to the Owner for separate APPLY authorization naming the exact
   Production/tooling SHAs, full allowlist hashes, live trio, execution count
   and hash, and exact future command.
8. Only after that new authorization, repeat every gate, re-attest the live
   trio immediately before mutation, and call the approved authority with only
   the derived execution set.
9. Re-attest the live trio and cohort after pass one, then run the same
   execution set immediately for the required zero-award second pass.
10. Re-attest the live trio and cohort after pass two and validate the complete
    historical delta before any Dashboard acceptance.

Do not allow profile verification, official-result finalization, tournament or
season finalization, account closure, candidate cleanup, or reconciliation to
race candidate/trio attestation and a future two-pass apply. If the population,
trio, execution hash, or deployment changes, fail closed and return for review.

## Complete Production candidate population

The full candidate list is population attestation, not a hand-selected write
list. It must contain **every legitimate open Production player**, including
players with incomplete profiles and players expected to qualify for no Badge.
Do not filter it by Steam/Relic verification, profile completeness, ELO,
tournament history, match history, award expectation, or any Badge rule. The
only subtraction is the owner of the exact independently attested live trio;
that subtraction occurs inside the runner after population attestation. For
the remaining historical execution set, `backfillInitialBadgeAwards()` alone
decides qualification.

Exclude only a row that is provably outside the required population:

- `account_closed_at IS NOT NULL` (closed);
- a deleted/missing player row or an unavailable identity under the reviewed
  identity contract;
- immutable provenance in
  `ironclad_private.staging_synthetic_uat_players` (synthetic/UAT); or
- another non-Production fixture only when an authoritative, separately
  reviewed provenance marker proves it. Names, email domains, lack of activity,
  incomplete profiles, or operator familiarity are not proof.

Closed and deleted rows are absent from the open-player base. Synthetic/UAT
and unavailable-identity exclusions must be counted separately. The evidence
must satisfy:

```text
globalOpenCount
= candidateCount
+ excludedSyntheticOrUatCount
+ excludedUnavailableIdentityCount
+ excludedOtherProvenFixtureCount
```

The exclusion categories must be disjoint. Any unexplained remainder or
unreviewed heuristic is a blocker.

### Exact read-only candidate derivation

Do not hand-build the file. After the application migrations are present,
derive it from the authoritative Production `players` table and immutable UAT
provenance using this read-only, repeatable-read transaction. The only
currently approved non-Production provenance source in this query is
`ironclad_private.staging_synthetic_uat_players`; if another source is needed,
stop and obtain review for an exact query revision rather than editing the
output by hand.

The command keeps raw IDs in process memory and the private output file. Its
terminal evidence contains only counts and hashes.

```powershell
$productionAllowlist = "C:\ABSOLUTE\PRIVATE\PATH\badge-backfill-production.json"
$derivationSqlPath = Join-Path ([IO.Path]::GetTempPath()) ("ironclad-badge-candidates-" + [guid]::NewGuid().ToString("N") + ".sql")
$utf8NoBom = [Text.UTF8Encoding]::new($false)

if (Test-Path -LiteralPath $productionAllowlist) {
  throw "The private candidate file already exists; choose a new path."
}
if (-not (Test-Path -LiteralPath (Split-Path -Parent $productionAllowlist) -PathType Container)) {
  throw "The private candidate directory does not exist."
}

$derivationSql = @'
begin transaction isolation level repeatable read read only;
set local search_path = pg_catalog, public;

with classified as (
  select
    player.id,
    player.account_closed_at,
    fixture.player_id is not null as is_synthetic_uat,
    player.clerk_user_id is null
      or btrim(player.clerk_user_id) = ''
      or player.clerk_user_id !~ '^user_[A-Za-z0-9]+$'
      as has_unavailable_identity
  from public.players as player
  left join ironclad_private.staging_synthetic_uat_players as fixture
    on fixture.player_id = player.id
), population as (
  select
    count(*) filter (
      where account_closed_at is null
    )::bigint as global_open_count,
    count(*) filter (
      where account_closed_at is null
        and is_synthetic_uat
    )::bigint as excluded_synthetic_uat_count,
    count(*) filter (
      where account_closed_at is null
        and not is_synthetic_uat
        and has_unavailable_identity
    )::bigint as excluded_unavailable_identity_count,
    count(*) filter (
      where account_closed_at is null
        and not is_synthetic_uat
        and not has_unavailable_identity
    )::bigint as candidate_count,
    coalesce(
      jsonb_agg(id::text order by id) filter (
        where account_closed_at is null
          and not is_synthetic_uat
          and not has_unavailable_identity
      ),
      '[]'::jsonb
    ) as candidate_ids
  from classified
)
select * from population;

rollback;
'@

try {
  [IO.File]::WriteAllText($derivationSqlPath, $derivationSql, $utf8NoBom)
  $queryOutput = (& npx.cmd --yes supabase@2.114.0 --output-format json db query --linked --project-ref nsyjtqpvyxlzyujlbzos --file $derivationSqlPath 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Production candidate derivation failed." }

  try { $queryResult = $queryOutput | ConvertFrom-Json } catch {
    throw "Production candidate derivation returned invalid JSON."
  }
  $rows = @($queryResult.rows)
  if ($rows.Count -ne 1) { throw "Production candidate derivation returned an invalid row count." }
  $row = $rows[0]

  $globalOpenCount = [int64]$row.global_open_count
  $excludedSyntheticCount = [int64]$row.excluded_synthetic_uat_count
  $excludedUnavailableCount = [int64]$row.excluded_unavailable_identity_count
  $excludedOtherFixtureCount = [int64]0
  $candidateCount = [int64]$row.candidate_count

  if ($globalOpenCount -le 0) { throw "Production has no open population to attest." }
  if ($candidateCount -le 0) { throw "Production has no legitimate open candidates to evaluate." }
  if ($globalOpenCount -ne ($candidateCount + $excludedSyntheticCount + $excludedUnavailableCount + $excludedOtherFixtureCount)) {
    throw "Production candidate population does not reconcile."
  }

  $candidateIds = @($row.candidate_ids)
  if ($candidateIds.Count -ne $candidateCount) {
    throw "Production candidate count and derived IDs differ."
  }
  $canonicalIds = @($candidateIds | ForEach-Object {
    $candidate = [string]$_
    if ($candidate -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
      throw "Production candidate set contains a non-canonical UUID."
    }
    $candidate
  } | Sort-Object)
  if (@($canonicalIds | Select-Object -Unique).Count -ne $canonicalIds.Count) {
    throw "Production candidate set contains a duplicate UUID."
  }
  if (($candidateIds -join "`n") -cne ($canonicalIds -join "`n")) {
    throw "Production candidate set is not canonically sorted."
  }

  $allowlistDocument = [ordered]@{
    schemaVersion = 1
    target = "production"
    projectRef = "nsyjtqpvyxlzyujlbzos"
    playerIds = $canonicalIds
  }
  $allowlistJson = $allowlistDocument | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText($productionAllowlist, $allowlistJson + "`n", $utf8NoBom)

  $fileSha256 = (Get-FileHash -LiteralPath $productionAllowlist -Algorithm SHA256).Hash.ToLowerInvariant()
  $serializedIds = ($canonicalIds -join "`n") + "`n"
  $playerIdsSha256 = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($utf8NoBom.GetBytes($serializedIds))
  ).ToLowerInvariant()

  [pscustomobject]@{
    target = "production"
    projectRef = "nsyjtqpvyxlzyujlbzos"
    globalOpenCount = $globalOpenCount
    candidateCount = $candidateCount
    excludedSyntheticOrUatCount = $excludedSyntheticCount
    excludedUnavailableIdentityCount = $excludedUnavailableCount
    excludedOtherProvenFixtureCount = $excludedOtherFixtureCount
    populationEquationMatches = $true
    fileSha256 = $fileSha256
    playerIdsSha256 = $playerIdsSha256
  } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $derivationSqlPath) {
    Remove-Item -LiteralPath $derivationSqlPath -Force
  }
  $queryOutput = $null
  $queryResult = $null
  $candidateIds = $null
  $canonicalIds = $null
}
```

Do not paste or print `$queryOutput`, `$candidateIds`, `$canonicalIds`, or the
raw file. If the identity availability check or another authoritative source
finds a well-formed Clerk ID that is actually deleted/unavailable, stop: do not
silently remove its player UUID. Resolve and review its authoritative status,
then rerun the exact derivation. The frozen file must be reproducible from the
reviewed sources.

### Canonical file and hashes

The private file must remain outside the repository, build output, CI
artifacts, shell history, and shared logs. It has exactly this schema:

```json
{
  "schemaVersion": 1,
  "target": "production",
  "projectRef": "nsyjtqpvyxlzyujlbzos",
  "playerIds": [
    "00000000-0000-4000-8000-000000000000"
  ]
}
```

The example UUID is not an authorized player. IDs must already be lowercase,
valid, unique, and lexically sorted. Freeze the file byte-for-byte after
review; whitespace or key-order changes require a new hash and preflight.

Two hashes bind different things:

- `--allowlist-sha256` and `allowlist.fileSha256` are the SHA-256 of the exact
  JSON file bytes.
- `allowlist.playerIdsSha256` is the SHA-256 of the sorted UUIDs serialized one
  per line with one trailing LF. It binds the semantic candidate set and must
  match both the read-only SQL and service-role attestations.

Recompute only the raw-file hash without exposing content:

```powershell
$productionAllowlistSha256 = (Get-FileHash -LiteralPath $productionAllowlist -Algorithm SHA256).Hash.ToLowerInvariant()
```

## Collision-aware current Production baseline

The full allowlist remains population attestation, not a write list. The
current authoritative Production values are:

```text
populationAttestation.count = 2
populationAttestation.playerIdsSha256 = 5d9ba68c581d92994fc25394303395f5d261a8d402e9fa7dc97baf683c00d0d3
allowlist.fileSha256 = ed6fcde74fef31e71549954b9c50ab9d6697b0989fb0fe807021e3f27f73cd6d

liveBaseline.awardId = 7aafe28e-0a3e-4b05-96ea-c1ece084d97b
liveBaseline.notificationId = b25dd0e9-b27d-48a4-942c-8e8e232f276d
liveBaseline.revealId = 6f5b2632-c91b-4971-b4db-19240ed7f729
liveBaseline.playerFingerprint = b71196840fa09572

historicalExecutionSet.count = 1
historicalExecutionSet.playerIdsSha256 = acdccbcee9e2a5c869c8bb7279eae49f43c2b09ade999ab21a1eef3eb06c0bc1
historicalExecutionSet.playerFingerprint = 41efa45d817786c1
```

Do not replace the private two-player allowlist with a one-player file and do
not manually select the historical player. After the complete legitimate-open
cohort and exact live trio are independently attested, derive:

```text
historicalExecutionSet
= completeLegitimateOpenCandidateIds
- liveBaseline.playerId
```

Canonicalize and hash that derived set with the existing player-ID hashing
rules. Require count `1` and the exact execution-set hash above. Only this
derived set may be passed as `playerIds` to `backfillInitialBadgeAwards()`.
The live-baseline player must never be included in that authority call.

The award UUID above must identify exactly one award belonging to a player in
the full two-player cohort. Require Badge slug `ironclad-recruit`, source type
`profile`, `source_metadata.evaluationMode = "live"`, and the expected player
linkage. The notification UUID must identify exactly one notification for the
same player's Clerk identity, recipient role `player`, type `badge.unlocked`,
event key `badge-award:7aafe28e-0a3e-4b05-96ea-c1ece084d97b:unlocked`, and
metadata linking the exact award with Badge slug `ironclad-recruit` and Badge
number `1`. The Reveal UUID must identify exactly one already
acknowledged/completed Reveal linking the same player and award.

Normalize the live-trio snapshot to immutable ownership, authority, and
linkage properties. Mutable notification presentation fields such as read or
hidden timestamps are not ownership linkage and must not cause a false
cutover failure; they also must never be modified by the runner.

The reviewed no-write authority evaluation established that this live player
has no missing awards across the current 30 Badge rules. That evidence does
not authorize duplicating rule logic in the runner: exclusion is based only on
the exact live-baseline attestation, and the unchanged authority evaluates the
remaining historical player.

Accept no other non-backfill Badge ownership. A missing or changed trio row,
wrong linkage/property, extra non-backfill award, population mismatch, or
execution-set mismatch is a stop condition; it is not permission to broaden
the baseline automatically.

The expected counts describe two separate scopes:

| Scope | Awards | `badge.unlocked` notifications | Reveal acknowledgements |
| --- | ---: | ---: | ---: |
| Global current Production | 1 | 1 | 1 |
| Historical-backfill state | 0 | 0 | 0 |

The global `1/1/1` is the exact pinned legitimate live lifecycle, not a
backfill failure. Historical checks must be scoped to awards whose
`source_metadata.evaluationMode` is `backfill`, plus notifications and Reveals
associated with those awards. Arbitrary live state remains forbidden.

Snapshot and re-attest the exact live award, notification, and Reveal at four
gates: (1) initial read-only preflight, (2) immediately before a separately
authorized mutation, (3) after historical pass one, and (4) after historical
pass two. Compare all relevant authority and linkage fields. If the trio
changes during the window, stop before the next operation and retain it
untouched.

## Staging validation disposition

No genuine, non-synthetic, provider-verified Staging candidate is currently
attested and available for this cutover. The known permanent Staging accounts
are synthetic/UAT fixtures, while inventing, editing, or borrowing a provider
identity would violate the legitimate-player and no-manual-data constraints.
Do not run a live Staging apply without a separately attested genuine candidate,
do not create a Staging player, and do not weaken the candidate rule merely to
manufacture a positive Recruit result.

This is not a release blocker. The reviewed automated runner tests, authority
tests, and dry-run/preflight simulations are the sufficient Staging-equivalent
safety validation. On the exact tooling head, require at minimum:

```powershell
node scripts/badges/initial-awards-backfill.mjs --help
npx vitest run tests/unit/badge-initial-backfill-cli.test.ts tests/integration/badge-initial-backfill-contract.test.ts
```

The automated evidence must cover target/ref and split-head rejection, dirty
tooling rejection, canonical file/hash rejection, complete-candidate
attestation, all-or-none collision arguments, exact live-trio identity and
linkage, unexpected-live-state rejection, derived execution-set hashing and
live-player exclusion, `evaluationMode: "backfill"`, historical notification
suppression, absence of historical Reveal rows, live-trio immutability at all
four gates, first-pass failure handling, partial-write retry, and immediate
second-pass zero. It must not load Production credentials or contact either
live environment. A read-only Production preflight remains mandatory.

## Production preflight — read only

Run this from the root of the clean reviewed tooling checkout after reconfirming
the deployed application and migration ledger. Fill in only the new reviewed
tooling SHA and the existing private two-player allowlist path. The command
uses the pinned Supabase CLI to read the two existing legacy project keys into
process memory, runs the local runner directly, and removes the three temporary
runner variables in `finally`. Do not use `vercel env run` for credentials.

Use only existing keys returned by the authenticated pinned CLI for exact
project `nsyjtqpvyxlzyujlbzos`. Do not create, rotate, disable, print, decode,
persist, copy, or commit a key; do not alter Supabase or Vercel configuration.
Capture the JSON response only in process memory—never use `tee`, a temporary
credential file, `.env`, shell tracing, or verbose output. If the exact legacy
`service_role` JWT and legacy public `anon` key cannot be selected uniquely,
stop without another workaround. The fixed URL and two key values may exist
only in the current PowerShell process for the direct runner invocation and
must be absent after `finally` cleanup.

```powershell
$releaseSourceHead = "ac612018f6c27963a59df84815d0a76ebbcbd27e"
$applicationTree = "6ba0e3b2308bd22c3c9dea62efb235f1bb48326c"
$productionHead = "c6109d85de98f73545209a016c3114d953b8ebba"
$toolingHead = "REPLACE_WITH_40_CHARACTER_REVIEWED_TOOLING_SHA"
$productionAllowlist = "C:\ABSOLUTE\PRIVATE\PATH\badge-backfill-production.json"
$productionAllowlistSha256 = (Get-FileHash -LiteralPath $productionAllowlist -Algorithm SHA256).Hash.ToLowerInvariant()
$productionBaseUrl = "https://www.ironcladtournaments.com"
$expectedAllowlistSha256 = "ed6fcde74fef31e71549954b9c50ab9d6697b0989fb0fe807021e3f27f73cd6d"
$expectedLiveAwardId = "7aafe28e-0a3e-4b05-96ea-c1ece084d97b"
$expectedLiveNotificationId = "b25dd0e9-b27d-48a4-942c-8e8e232f276d"
$expectedLiveRevealId = "6f5b2632-c91b-4971-b4db-19240ed7f729"
$expectedExecutionCount = 1
$expectedExecutionSetSha256 = "acdccbcee9e2a5c869c8bb7279eae49f43c2b09ade999ab21a1eef3eb06c0bc1"
$expectedToolingPaths = @(
  "docs/achievement-badge-production-cutover-runbook.md"
  "scripts/badges/initial-awards-backfill.mjs"
  "tests/integration/badge-initial-backfill-contract.test.ts"
  "tests/unit/badge-initial-backfill-cli.test.ts"
)
$ambientGitControls = @(Get-ChildItem Env: | Where-Object { $_.Name -like "GIT_*" })
if ($ambientGitControls.Count -ne 0) { throw "Ambient Git control variables must be removed before cutover." }

git --no-replace-objects fetch --no-tags origin refs/heads/master:refs/remotes/origin/master
if ($LASTEXITCODE -ne 0) { throw "Unable to refresh origin/master." }
if ((git --no-replace-objects rev-parse HEAD).Trim() -cne $toolingHead) { throw "Wrong local tooling head." }
if ((git --no-replace-objects status --porcelain | Out-String).Trim().Length -ne 0) { throw "Local tooling checkout is not clean." }
if ((git --no-replace-objects rev-parse refs/remotes/origin/master).Trim() -cne $productionHead) { throw "origin/master does not equal the authorized Production head." }
if ((git --no-replace-objects rev-parse ($releaseSourceHead + "^{tree}")).Trim() -cne $applicationTree) { throw "Release source tree mismatch." }
if ((git --no-replace-objects rev-parse ($productionHead + "^{tree}")).Trim() -cne $applicationTree) { throw "Production head tree mismatch." }
if ((git --no-replace-objects merge-base $toolingHead $releaseSourceHead).Trim() -cne $releaseSourceHead) { throw "Tooling head is not descended from the release source head." }
$actualToolingPaths = @(git --no-replace-objects diff --name-only --no-renames ($releaseSourceHead + ".." + $toolingHead) --)
$toolingPathDifference = @(Compare-Object ($expectedToolingPaths | Sort-Object) ($actualToolingPaths | Sort-Object))
if ($toolingPathDifference.Count -ne 0) { throw "Tooling diff is not the exact reviewed four-path set." }
if ($productionAllowlistSha256 -cne $expectedAllowlistSha256) { throw "Private allowlist file hash mismatch." }

$temporaryRunnerVariables = @(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
)
foreach ($variableName in $temporaryRunnerVariables) {
  if (Test-Path -LiteralPath ("Env:" + $variableName)) {
    throw "A temporary runner variable is already present; use a clean PowerShell process."
  }
}
if (Test-Path -LiteralPath "Env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  throw "An ambient public-key override is present; use a clean PowerShell process."
}

$rawKeyResponse = $null
$keyRows = $null
$legacyAnonRows = $null
$legacyServiceRoleRows = $null
$legacyAnonKey = $null
$legacyServiceRoleKey = $null
$preflightFailed = $false

try {
  $rawKeyResponse = (& npx.cmd --yes supabase@2.114.0 projects api-keys `
    --project-ref nsyjtqpvyxlzyujlbzos `
    --output json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Read-only Production API-key listing failed." }

  try {
    $keyRows = @($rawKeyResponse | ConvertFrom-Json)
  } catch {
    throw "Production API-key listing did not return valid JSON."
  }

  $legacyAnonRows = @($keyRows | Where-Object {
    $_.name -ceq "anon" -and $_.type -ceq "legacy"
  })
  $legacyServiceRoleRows = @($keyRows | Where-Object {
    $_.name -ceq "service_role" -and $_.type -ceq "legacy"
  })
  if ($legacyAnonRows.Count -ne 1 -or $legacyServiceRoleRows.Count -ne 1) {
    throw "Exact existing legacy anon/service_role keys were not uniquely available."
  }

  $legacyAnonKey = [string]$legacyAnonRows[0].api_key
  $legacyServiceRoleKey = [string]$legacyServiceRoleRows[0].api_key
  if ([string]::IsNullOrWhiteSpace($legacyAnonKey) -or
      [string]::IsNullOrWhiteSpace($legacyServiceRoleKey) -or
      $legacyServiceRoleKey.Split(".").Count -ne 3) {
    throw "Existing legacy Production key validation failed."
  }

  $env:NEXT_PUBLIC_SUPABASE_URL = "https://nsyjtqpvyxlzyujlbzos.supabase.co"
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $legacyAnonKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $legacyServiceRoleKey

  & node scripts/badges/initial-awards-backfill.mjs `
    --target production `
    --confirm-project-ref nsyjtqpvyxlzyujlbzos `
    --base-url $productionBaseUrl `
    --expected-production-head $productionHead `
    --expected-tooling-head $toolingHead `
    --allowlist-file $productionAllowlist `
    --allowlist-sha256 $productionAllowlistSha256 `
    --expected-live-award-id $expectedLiveAwardId `
    --expected-live-notification-id $expectedLiveNotificationId `
    --expected-live-reveal-id $expectedLiveRevealId `
    --expected-execution-count $expectedExecutionCount `
    --expected-execution-set-sha256 $expectedExecutionSetSha256
  if ($LASTEXITCODE -ne 0) { throw "Read-only Production Badge preflight failed." }
} catch {
  # Preserve no ErrorRecord or credential-bearing output. Cleanup and its
  # verification must complete before a sanitized failure is raised.
  $preflightFailed = $true
} finally {
  foreach ($variableName in $temporaryRunnerVariables) {
    Remove-Item -LiteralPath ("Env:" + $variableName) -ErrorAction SilentlyContinue
  }
  $legacyAnonKey = $null
  $legacyServiceRoleKey = $null
  $legacyAnonRows = $null
  $legacyServiceRoleRows = $null
  $keyRows = $null
  $rawKeyResponse = $null
}

foreach ($variableName in $temporaryRunnerVariables) {
  if (Test-Path -LiteralPath ("Env:" + $variableName)) {
    throw "Temporary runner variable cleanup failed."
  }
}
if ($preflightFailed) {
  throw "Read-only Production Badge preflight failed; temporary runner variables were removed."
}
```

There is no `--apply` flag in this command. It must perform no database write.
The runner must Vite-load and verify the authority export without invoking it,
must not load an environment file, and must always close its local server.

The runner independently performs a fresh fetch/read of `origin/master` and
requires `origin/master == --expected-production-head`. It resolves both Git
trees and requires
`tree(productionHead) == tree(releaseSourceHead) == applicationTree`. It then
reads the canonical READY Vercel deployment and requires
`deployment.gitSource.sha == productionHead`. Operator-side checks above do
not replace these runner gates. The runner strips ambient `GIT_*` controls,
disables Git replacement objects, and emits its tooling head, tree, merge base,
and exact diff paths as sanitized evidence.

Preflight must fail closed for a target/ref/URL mismatch; stale or mismatched
`origin/master`; release-source or Production tree mismatch; READY Vercel
`gitSource.sha` mismatch; local tooling SHA/base/diff/cleanliness mismatch;
candidate count/hash mismatch; closed, missing, synthetic, or unavailable
allowlisted player; changed file bytes; a partial collision-aware argument set;
a missing, mismatched, or noncanonical pinned live trio; any unexpected
non-backfill award; execution count/hash mismatch; or any retained backfill
award with a matching historical notification or Reveal. The exact
18-migration ledger with ceiling `20260831134000` is a separate mandatory
prerequisite gate and must already be green before this runner is invoked.

The exact successful read-only result is `BADGE_BACKFILL_PREFLIGHT_READY` with
population count/hash `2` / `5d9ba68c...`, derived execution count/hash `1` /
`acdccbce...`, an unchanged exact live trio, global `1/1/1`, historical
backfill `0/0/0`, and `productionMutationMayHaveOccurred = false`. Stop after
recording sanitized evidence; `--apply` remains unauthorized.

Review and archive only sanitized evidence. Then stop and request the second
Owner authorization. That authorization must identify:

- `releaseSourceHead`, `applicationTree`, and post-merge `productionHead`;
- proof of fresh `origin/master`, both equal trees, and the READY Vercel
  `gitSource.sha`;
- tooling head, tooling tree, merge base, and exact four-path diff;
- canonical Production URL and project ref;
- global-open, candidate, and each exclusion count;
- `allowlist.fileSha256` and `allowlist.playerIdsSha256`;
- all three pinned live row IDs and sanitized property/linkage attestations;
- the derived historical execution count and player-set SHA-256;
- global award/notification/Reveal counts separately from backfill-specific
  counts;
- preflight timestamp/result and migration ledger evidence; and
- the exact apply command below.

## Production apply — separate Owner authorization required

`--apply` is **not authorized by this runbook revision or its preflight**.
After a new, separate Owner authorization, repeat the exact Git, deployment,
allowlist-hash, API-key retrieval, in-memory injection, and `finally` cleanup
procedure from the read-only command. Inside that same protected process,
re-attest the live trio immediately before mutation and invoke the identical
local command with only one additional flag:

```powershell
& node scripts/badges/initial-awards-backfill.mjs `
  --target production `
  --confirm-project-ref nsyjtqpvyxlzyujlbzos `
  --base-url https://www.ironcladtournaments.com `
  --expected-production-head c6109d85de98f73545209a016c3114d953b8ebba `
  --expected-tooling-head REPLACE_WITH_40_CHARACTER_OWNER_AUTHORIZED_TOOLING_SHA `
  --allowlist-file $productionAllowlist `
  --allowlist-sha256 ed6fcde74fef31e71549954b9c50ab9d6697b0989fb0fe807021e3f27f73cd6d `
  --expected-live-award-id 7aafe28e-0a3e-4b05-96ea-c1ece084d97b `
  --expected-live-notification-id b25dd0e9-b27d-48a4-942c-8e8e232f276d `
  --expected-live-reveal-id 6f5b2632-c91b-4971-b4db-19240ed7f729 `
  --expected-execution-count 1 `
  --expected-execution-set-sha256 acdccbcee9e2a5c869c8bb7279eae49f43c2b09ade999ab21a1eef3eb06c0bc1 `
  --apply
```

The apply must call `backfillInitialBadgeAwards()` only with the derived
one-player historical execution set, never the full allowlist and never the
live-baseline player. If the authority returns an error, stop and preserve any
committed historical award for inspection. Pass one must evaluate exactly one
player and create exactly one `ironclad-recruit` award with source `profile`
and `source_metadata.evaluationMode = "backfill"`. It must create zero
notifications and zero Reveal acknowledgements associated with that award.

After re-attesting the exact unchanged live trio and unchanged full cohort,
run pass two immediately over the same derived one-player execution set. It
must create zero awards, notifications, or Reveals. Re-attest the trio again
after pass two. Any trio change, unexpected DML target, extra award, historical
notification/Reveal, cohort/hash drift, evaluator error, or nonzero second pass
fails the cutover; it never authorizes cleanup or continuation.

## Required sanitized evidence and values

Never archive raw player IDs, the private file, credentials, SQL result bodies,
private proof paths, or signed URLs. Retain the exact command with the private
path redacted, UTC timestamp, authorization reference, and sanitized JSON.

Require these artifact and candidate groups:

- `releaseSourceHead`, `releaseSourceTree`, `approvedApplicationTree`,
  `expectedProductionHead`, `productionHead`, and
  `productionApplicationTree`;
- `deployment.target`, `deployment.gitSha`, and the canonical Production URL;
- `expectedToolingHead`, `toolingHead`, `toolingTree`, `toolingBaseHead`,
  `toolingMergeBase`, and `toolingDiffPaths`, plus separately recorded
  clean-status evidence;
- migration expected/applied count (`18`), ceiling `20260831134000`, and
  ledger match;
- derivation output `globalOpenCount`, `candidateCount`, each disjoint
  exclusion count, and `populationEquationMatches`;
- `allowlist.count`, `allowlist.fileSha256`, and
  `allowlist.playerIdsSha256`;
- `databaseAttestation.allowlistCount`, `allowlistHashMatches`,
  `allowlistClosedOrMissingCount`, `allowlistSyntheticOverlapCount`,
  `allowlistUnavailableIdentityCount`, and
  `allAllowlistedPlayersLegitimateOpen`, plus `candidatePlayerCount`,
  `candidatePlayerSha256`, and `candidateHashMatches`;
- `serviceRoleAttestation.allowlistCount` and `allowlistHashMatches`;
- `collisionAwareBaseline.liveAwardId`, `liveNotificationId`, `liveRevealId`,
  and `liveTrioValidated`;
- `historicalExecutionSet.count`, `playerIdsSha256`,
  `livePlayerExcluded`, and the sanitized member fingerprint;
- `authority.loader`, `authority.exportVerified`, and `authority.envFile`;
- `before.awardCount`, `globalBadgeState.awardCount`, `notificationCount`, and
  `revealCount`, separately from `retainedBackfillAwardCount`,
  `retainedBackfillNotifications`, and `retainedBackfillReveals`;
- `firstPass.playersEvaluated`, `awardsCreated`, `badgeCounts`, `errorCount`,
  and `errorsByCode`, and the same fields for `secondPass`; and
- `postconditions.databaseAttestationUnchanged`,
  `databaseAttestationUnchangedAfterFirstPass`, `gitAttestationUnchanged`, and
  `liveBaselineUnchanged` (which certifies all four required checkpoints),
  `evaluationModeBackfill`, `firstPassNewAwards`, `matchingNotifications`,
  `matchingReveals`, `secondPassNewAwards`, `secondPassZero`, and
  `validatedBackfillCohortAwards`.

`allAllowlistedPlayersLegitimateOpen` means eligible for operational evaluation
(legitimate, open, present, non-fixture, available identity); it does not mean
the player qualifies for a Badge.

Required values are:

```text
releaseSourceHead = ac612018f6c27963a59df84815d0a76ebbcbd27e
releaseSourceTree = 6ba0e3b2308bd22c3c9dea62efb235f1bb48326c
approvedApplicationTree = 6ba0e3b2308bd22c3c9dea62efb235f1bb48326c
productionHead = expectedProductionHead = freshly fetched origin/master = c6109d85de98f73545209a016c3114d953b8ebba
productionApplicationTree = approvedApplicationTree
deployment.gitSha = productionHead
deployment.target = "production"
toolingBaseHead = releaseSourceHead
expectedToolingHead = local clean HEAD
toolingHead = expectedToolingHead
toolingMergeBase = releaseSourceHead
toolingDiffPaths = exact four authorized paths
migrations.expectedCount = 18
migrations.appliedCount = 18
migrations.ceiling = 20260831134000
migrations.ledgerMatches = true
populationEquationMatches = true
candidateCount = allowlist.count = 2
playerIdsSha256 = allowlist.playerIdsSha256 = 5d9ba68c581d92994fc25394303395f5d261a8d402e9fa7dc97baf683c00d0d3
allowlist.fileSha256 = ed6fcde74fef31e71549954b9c50ab9d6697b0989fb0fe807021e3f27f73cd6d
databaseAttestation.allowlistHashMatches = true
databaseAttestation.candidatePlayerCount = allowlist.count
databaseAttestation.candidatePlayerSha256 = allowlist.playerIdsSha256
databaseAttestation.candidateHashMatches = true
databaseAttestation.allowlistClosedOrMissingCount = 0
databaseAttestation.allowlistSyntheticOverlapCount = 0
databaseAttestation.allowlistUnavailableIdentityCount = 0
databaseAttestation.allAllowlistedPlayersLegitimateOpen = true
serviceRoleAttestation.allowlistHashMatches = true
authority.loader = "vite-ssr"
authority.exportVerified = true
authority.envFile = false
collisionAwareBaseline.liveAwardId = 7aafe28e-0a3e-4b05-96ea-c1ece084d97b
collisionAwareBaseline.liveNotificationId = b25dd0e9-b27d-48a4-942c-8e8e232f276d
collisionAwareBaseline.liveRevealId = 6f5b2632-c91b-4971-b4db-19240ed7f729
collisionAwareBaseline.liveTrioValidated = true
historicalExecutionSet.count = 1
historicalExecutionSet.playerIdsSha256 = acdccbcee9e2a5c869c8bb7279eae49f43c2b09ade999ab21a1eef3eb06c0bc1
historicalExecutionSet.livePlayerExcluded = true
before.awardCount = 1
before.nonBackfillAwardCount = 1
before.globalBadgeState.awardCount = 1
before.globalBadgeState.notificationCount = 1
before.globalBadgeState.revealCount = 1
before.retainedBackfillAwardCount = 0
before.retainedBackfillNotifications = 0
before.retainedBackfillReveals = 0
firstPass.playersEvaluated = historicalExecutionSet.count
firstPass.awardsCreated = 1
firstPass.badgeCounts.ironclad-recruit = 1
firstPass.errorCount = 0
postconditions.firstPassNewAwards = firstPass.awardsCreated
postconditions.evaluationModeBackfill = true
postconditions.matchingNotifications = 0
postconditions.matchingReveals = 0
secondPass.playersEvaluated = historicalExecutionSet.count
secondPass.awardsCreated = 0
secondPass.errorCount = 0
postconditions.secondPassNewAwards = 0
postconditions.secondPassZero = true
postconditions.databaseAttestationUnchangedAfterFirstPass = true
postconditions.databaseAttestationUnchanged = true
postconditions.gitAttestationUnchanged = true
postconditions.liveBaselineUnchanged = true
```

Production's collision-aware execution expects exactly the pinned live award
as its only non-backfill baseline award. Every retained historical award must
have `source_metadata.evaluationMode = "backfill"`. Any other non-backfill
award, including another otherwise valid live award, fails closed and requires
a fresh forensic review; it is never silently accepted.

The apply must re-run the read-only database attestation after pass one and
must not begin pass two if count/hash or candidate status changed. It re-runs
the same attestation after pass two. A change fails with
`DATABASE_ATTESTATION_CHANGED_AFTER_FIRST_PASS` or
`DATABASE_ATTESTATION_CHANGED_DURING_BACKFILL`, respectively. Valid awards
already committed remain valid, but the cutover is not accepted.

The notification/Reveal checks cover the **entire retained historical
backfill cohort**, not the pinned live trio and not only current-run deltas.
`postconditions.validatedBackfillCohortAwards` must equal the retained
historical cohort count actually inspected. Separately, each live-trio gate
must prove exact immutability. This permits a clean retry after partial writes
without misclassifying the legitimate live `1/1/1` or hiding a historical
notification or acknowledgement.

## Required natural Recruit outcome

Complete all retry/idempotency, live-trio, and cohort checks before the
historical execution candidate visits Dashboard after a future apply. The
already-live player has completed a legitimate Reveal and is outside this
acceptance flow. For the historical candidate whose already verified data
satisfies the complete IronClad Recruit rule, require:

```text
existing verified Production data
→ historical backfill
→ one IronClad Recruit award
→ no historical badge.unlocked notification
→ no reveal acknowledgement
→ pending Reveal on next Dashboard visit
→ approved Reveal animation
→ acknowledgement persists
```

Do not choose the candidate by editing facts and do not award it manually.
Qualification must be the result of `backfillInitialBadgeAwards()`. Before the
player acts, verify exactly one Recruit award for that qualifying player, mode
`backfill`, zero matching notifications, and zero Reveal rows. Do not
acknowledge on the player's behalf.

On the player's next natural authenticated `/dashboard` visit, the Badge must
be pending. “Not now” must not create an acknowledgement and a refresh must
leave it pending. After the player completes the approved centered 3D Reveal,
exactly one owned `player_badge_reveals` row must persist; refreshes of
`/dashboard` and `/dashboard/badges` must not replay it. Repeated
acknowledgement must be idempotent. Recheck that no historical
`badge.unlocked` notification, Badge email, or Web Push was created.

Once the new historical award has been naturally acknowledged, a fresh
cutover preflight will intentionally reject its changed baseline. Therefore
never begin the historical candidate's Dashboard acceptance while an apply
retry or postcondition investigation remains open. This does not alter or
invalidate the already-completed live Reveal.

## Failure, retry, and rollback behavior

The evaluator is idempotent but the whole population is not one database
transaction. A player can receive valid awards before a later evaluator,
network call, or process fails. A client-side failure can leave the commit
result uncertain.

On any migration, deployment, or smoke-test failure during the separately
authorized release stage, stop before candidate derivation, preflight, or
apply. Do not improvise a migration rollback, redeploy, or partial continuation.
Record sanitized evidence, establish the exact applied migration ledger and
deployed Git identity, and return for an Owner-reviewed recovery decision.

On any preflight or apply failure:

1. Stop. Preserve the frozen file bytes privately and retain only sanitized
   evidence.
2. Do not automatically delete an award, notification, or Reveal. Do not
   manually insert a replacement award and do not switch to reconciliation.
3. Read authoritative before/after state by the exact frozen IDs. The observed
   database delta, not merely a returned counter, determines what committed.
4. Treat release-source/Production/tree mismatch, Vercel head mismatch,
   tooling base/diff mismatch, dirty tooling, population/hash drift,
   unattested or changed non-backfill metadata, any matching historical
   notification or Reveal, first-pass errors, or a nonzero second pass as a
   blocker.
5. Fix the underlying tooling, application, credential, identity, availability,
   or stable-window issue under review. Renew authorization if
   `releaseSourceHead`, `productionHead`, `applicationTree`, `toolingHead`, the
   tooling base/diff, deployment, candidate bytes, target state, or scope
   changes.
6. Retry only the existing `backfill` path over the same still-valid derived
   historical execution set. Never substitute the full allowlist or include
   the live-baseline player. Uniqueness on `(player_id, badge_slug)` preserves
   valid awards and prevents duplicates. Acceptance still requires a clean
   pass followed by an immediate zero-award pass, four live-trio attestations,
   and full retained-historical-cohort validation.

There is no automatic award rollback. Correct historical awards are immutable
entitlements; deleting them can cascade presentation state and destroy audit
evidence. Rolling back the application deployment is a separate Owner
decision and does not justify deleting correct ownership. If an award is
proven incorrect, stop and obtain a separately reviewed corrective procedure.

## Completion record

- Production mutations under this tooling revision: **zero required**
- Badge application release: **complete and frozen**
- Migration ledger ceiling: `20260831134000`
- Frozen PR #88 release source head: `ac612018...`
- Approved/Production application tree: `6ba0e3b...`
- `productionHead` / `origin/master`: `c6109d85...`
- READY canonical Vercel `gitSource.sha`: `c6109d85...`
- Reviewed collision-aware tooling head/tree/base/diff scope: pending new SHA
- Automated runner/collision test evidence: pending
- Staging live candidate/apply: **not performed; no genuine candidate attested**
- Production population count/hash: `2` / `5d9ba68c...`
- Production allowlist file SHA-256: `ed6fcde74...`
- Exact pinned live award/notification/Reveal: attested `1/1/1`
- Historical execution count/hash: `1` / `acdccbce...`
- Historical-backfill award/notification/Reveal baseline: `0/0/0`
- Fresh collision-aware read-only Production preflight: pending
- Separate Production backfill APPLY authorization: **not granted**
- Draft PR #89: must remain OPEN, Draft, and unmerged
- Production first pass / immediate zero pass: not run
- Production post-apply evidence: not applicable until separately authorized
- Natural Production Recruit Dashboard journey: pending after accepted apply
