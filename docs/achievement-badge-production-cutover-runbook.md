# Achievement Badge Production cutover runbook

## HOLD and authorization boundaries

**Production remains on HOLD.** This runbook is a proposal and evidence
contract. It does not authorize merging PR #88, applying a Production
migration, deploying Production, running the historical backfill, or otherwise
mutating Production.

Two later Owner authorizations are required and must not be combined:

1. a release-cutover authorization for the exact 18 migrations and the frozen
   PR #88 release source/content artifact; and
2. after deployment, smoke testing, candidate derivation, and a successful
   read-only backfill preflight, a separate authorization for the exact frozen
   Production candidate file and the `--apply` command.

Neither a green automated test nor a green read-only preflight authorizes an
apply. Stop and return to the Owner at both gates.

The one-time operation must call the already approved
`backfillInitialBadgeAwards()` authority with `evaluationMode: "backfill"`.
It must not manually insert or delete Badge awards, change qualification
rules, use reconciliation mode as a historical substitute, create historical
`badge.unlocked` notifications, or pre-create Reveal acknowledgements.

## Frozen release source, future Production head, and operator tooling

PR #88 remains feature-frozen at this exact source/content artifact:

| Artifact field | Required value |
| --- | --- |
| PR | `#88` |
| Release source head | `ac612018f6c27963a59df84815d0a76ebbcbd27e` |
| Approved application tree | `6ba0e3b2308bd22c3c9dea62efb235f1bb48326c` |
| Production head | Unknown until PR #88 is merged into `master` |

The operator runner and this runbook are a **separate reviewed local tooling
history** descended from the release source head. The tooling commits are not
part of PR #88, are not merged into the application artifact, and are not
deployed to Vercel. This separation is intentional: Production receives the
approved PR #88 content tree through the normal merge into `master`, while the
operator executes the runner from a clean local checkout of the separately
authorized tooling head.

`ac612018f6c27963a59df84815d0a76ebbcbd27e` is the PR #88 release source
head. It is **not** the future deployed Production SHA. After merge,
`productionHead` is the then-current `origin/master` SHA. It may have a
different commit identity, but its tree must equal both the release source tree
and the approved application tree.

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

The CLI arguments bind the future Production and tooling heads; the runner
separately pins the release source head and approved application tree:

```text
--target production
--confirm-project-ref nsyjtqpvyxlzyujlbzos
--base-url https://www.ironcladtournaments.com
--expected-production-head <40-character post-merge origin/master SHA>
--expected-tooling-head <40-character reviewed local tooling SHA>
--allowlist-file <absolute path to private JSON>
--allowlist-sha256 <lowercase SHA-256 of the exact file bytes>
[--apply]
```

Omitting `--apply` is read-only preflight. Supplying `--apply` is the only
runner mode permitted to create awards. The runner must fail closed if the
post-merge Production identity/tree, Vercel deployment identity, release
source/tree, or local tooling identity/base/diff differs from this contract.

## Authorized future cutover order

Do not start this sequence under the current HOLD. After the first separate
Owner authorization, perform the release in this order:

1. Reconfirm PR #88 still has release source head `ac612018...` and approved
   tree `6ba0e3b...`; reconfirm the separately reviewed tooling head, ancestry,
   clean checkout, and exact four-path diff.
2. Apply exactly the following 18 already reviewed migrations to Production,
   in ledger order, using the separately approved migration procedure:

   1. `20260821000000_badge_award_foundation.sql`
   2. `20260821001000_badge_batch_2_authority.sql`
   3. `20260821002000_badge_progression_championship_authority.sql`
   4. `20260821003000_badge_streak_clean_upset_authority.sql`
   5. `20260821004000_badge_season_authority.sql`
   6. `20260821005000_badge_bracket_progression_authority.sql`
   7. `20260821006000_match_authority_foundation.sql`
   8. `20260821007000_badge_reliable_competitor_authority.sql`
   9. `20260821008000_badge_comeback_commander_authority.sql`
   10. `20260821009000_tournament_championship_path_authority.sql`
   11. `20260821010000_badge_flawless_campaign_authority.sql`
   12. `20260830090000_player_badge_reveals.sql`
   13. `20260831090000_service_role_badge_e2e_season_read.sql`
   14. `20260831130000_badge_authority_forward_repairs.sql`
   15. `20260831131000_badge_reconciliation_targets.sql`
   16. `20260831132000_match_game_winner_authority.sql`
   17. `20260831133000_staging_badge_cross_division_acceptance.sql`
   18. `20260831134000_staging_badge_fixture_eligibility_compatibility.sql`

   Stop if the dry run or ledger contains any additional migration, if any
   expected migration is missing, or if the post-apply ledger is not exact.
3. Merge PR #88 without adding either tooling commit. Fetch `origin/master`
   after the merge and freeze its exact SHA as `productionHead`. Verify
   `origin/master == productionHead` and
   `tree(productionHead) == tree(releaseSourceHead) == applicationTree`. Stop
   if the merged Production tree differs from the approved content tree.
4. Deploy that exact `productionHead`. The READY canonical Vercel deployment
   must report `gitSource.sha == productionHead`; do not compare the deployed
   SHA to the pre-merge release source SHA.
5. Smoke test sign-in, Dashboard, Badge Collection, Profile/Steam/Relic, and
   tournament pages. Confirm no award, notification, Reveal, synthetic player,
   or fixture was manufactured by migration or deployment.
6. Enter a stable cutover window, derive and freeze the complete Production
   candidate list below, and run the exact read-only CLI command from the
   clean authorized tooling checkout.
7. Review the release-source/Production/tree and tooling/base/diff evidence,
   plus candidate, count, hash, database, baseline-award, notification, and
   Reveal evidence. Do not apply yet.
8. Return to the Owner for the second, explicit backfill authorization naming
   `releaseSourceHead`, `productionHead`, `applicationTree`, `toolingHead`,
   candidate count, both candidate hashes, and the exact apply command.
9. Only after that authorization, run the apply. The runner performs the first
   historical pass and the immediate idempotency pass over the same frozen
   candidate IDs.
10. Validate the complete retained backfill cohort before any candidate visits
   Dashboard. Only then allow a qualifying player to exercise the natural
   pending-Reveal journey.

Do not allow profile verification, official-result finalization, tournament or
season finalization, account closure, candidate cleanup, or reconciliation to
race candidate derivation and the two-pass apply. If the attested population
changes, fail closed and repeat read-only review with a newly frozen file.

## Complete Production candidate population

The candidate list is an evaluation population, not a list of presumed Badge
winners. It must contain **every legitimate open Production player**, including
players with incomplete profiles and players expected to qualify for no Badge.
Do not filter by Steam/Relic verification, profile completeness, ELO,
tournament history, match history, award expectation, or any Badge rule.
`backfillInitialBadgeAwards()` alone decides qualification.

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
attestation, `evaluationMode: "backfill"`, notification suppression, absence
of pre-created Reveal rows, first-pass failure handling, partial-write retry,
and immediate second-pass zero. It must not load Production credentials or
contact either live environment. A read-only Production preflight after the
approved application deployment remains mandatory.

## Production preflight — read only

Run this only after the first Owner authorization, the exact 18 migrations,
the PR #88 merge/deployment, smoke tests, and candidate derivation. Run it from
the root of the clean local tooling checkout. Fill in the exact post-merge
Production SHA, reviewed tooling SHA, and private file path.

```powershell
$releaseSourceHead = "ac612018f6c27963a59df84815d0a76ebbcbd27e"
$applicationTree = "6ba0e3b2308bd22c3c9dea62efb235f1bb48326c"
$productionHead = "REPLACE_WITH_40_CHARACTER_POST_MERGE_MASTER_SHA"
$toolingHead = "REPLACE_WITH_40_CHARACTER_REVIEWED_TOOLING_SHA"
$productionAllowlist = "C:\ABSOLUTE\PRIVATE\PATH\badge-backfill-production.json"
$productionAllowlistSha256 = (Get-FileHash -LiteralPath $productionAllowlist -Algorithm SHA256).Hash.ToLowerInvariant()
$productionBaseUrl = "https://www.ironcladtournaments.com"
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

npx.cmd --yes vercel@59.1.4 env run `
  --environment=production `
  --scope=ironclad-tournaments `
  -- node scripts/badges/initial-awards-backfill.mjs `
  --target production `
  --confirm-project-ref nsyjtqpvyxlzyujlbzos `
  --base-url $productionBaseUrl `
  --expected-production-head $productionHead `
  --expected-tooling-head $toolingHead `
  --allowlist-file $productionAllowlist `
  --allowlist-sha256 $productionAllowlistSha256
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
allowlisted player; changed file bytes; non-backfill Production baseline award;
or any retained backfill award with a matching historical notification or
Reveal. The exact 18-migration ledger is a separate mandatory prerequisite gate
and must already be green before this runner is invoked.

Review and archive only sanitized evidence. Then stop and request the second
Owner authorization. That authorization must identify:

- `releaseSourceHead`, `applicationTree`, and post-merge `productionHead`;
- proof of fresh `origin/master`, both equal trees, and the READY Vercel
  `gitSource.sha`;
- tooling head, tooling tree, merge base, and exact four-path diff;
- canonical Production URL and project ref;
- global-open, candidate, and each exclusion count;
- `allowlist.fileSha256` and `allowlist.playerIdsSha256`;
- preflight timestamp/result and migration ledger evidence; and
- the exact apply command below.

## Production apply — separate Owner authorization required

Immediately before apply, reconfirm the stable window, local clean checkout,
release source, post-merge Production head, both content trees, tooling
head/base/diff, READY deployment SHA, candidate counts, and both hashes. The
private file must be byte-identical to preflight. Add only `--apply`:

```powershell
$releaseSourceHead = "ac612018f6c27963a59df84815d0a76ebbcbd27e"
$applicationTree = "6ba0e3b2308bd22c3c9dea62efb235f1bb48326c"
$productionHead = "REPLACE_WITH_40_CHARACTER_POST_MERGE_MASTER_SHA"
$toolingHead = "REPLACE_WITH_40_CHARACTER_REVIEWED_TOOLING_SHA"
$productionAllowlist = "C:\ABSOLUTE\PRIVATE\PATH\badge-backfill-production.json"
$productionAllowlistSha256 = (Get-FileHash -LiteralPath $productionAllowlist -Algorithm SHA256).Hash.ToLowerInvariant()
$productionBaseUrl = "https://www.ironcladtournaments.com"
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

npx.cmd --yes vercel@59.1.4 env run `
  --environment=production `
  --scope=ironclad-tournaments `
  -- node scripts/badges/initial-awards-backfill.mjs `
  --target production `
  --confirm-project-ref nsyjtqpvyxlzyujlbzos `
  --base-url $productionBaseUrl `
  --expected-production-head $productionHead `
  --expected-tooling-head $toolingHead `
  --allowlist-file $productionAllowlist `
  --allowlist-sha256 $productionAllowlistSha256 `
  --apply
```

The apply invokes `backfillInitialBadgeAwards()` over fixed batches of the
frozen candidates. If a batch returns an error, the runner stops scheduling
later batches and preserves already committed awards for authoritative
inspection; it does not claim the full cohort was evaluated. A complete,
error-free first pass must evaluate every frozen candidate and its observed
database delta must equal the reported award count. Immediately before loading
the authority, the runner re-attests Git/tooling identity and rechecks the
deployment and Production candidate snapshot; mutation begins only if all
three remain unchanged. After pass one it re-attests the candidate snapshot
and begins the immediate second pass over the same frozen IDs only if that
snapshot is unchanged. Before reporting success it re-fetches/revalidates Git
identity and rechecks the deployment again. Incomplete and nonqualifying
players are expected to create zero awards; that is not an error. Acceptance
requires a complete second pass with no errors and zero additional awards.

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
- migration expected/applied count (`18`) and ledger match;
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
- `authority.loader`, `authority.exportVerified`, and `authority.envFile`;
- `before.awardCount`, `nonBackfillAwardCount`,
  `retainedBackfillAwardCount`, `retainedBackfillNotifications`, and
  `retainedBackfillReveals`;
- `firstPass.playersEvaluated`, `awardsCreated`, `badgeCounts`, `errorCount`,
  and `errorsByCode`, and the same fields for `secondPass`; and
- `postconditions.databaseAttestationUnchanged`,
  `databaseAttestationUnchangedAfterFirstPass`, `gitAttestationUnchanged`,
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
productionHead = expectedProductionHead = freshly fetched origin/master
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
migrations.ledgerMatches = true
populationEquationMatches = true
candidateCount = allowlist.count
playerIdsSha256 = allowlist.playerIdsSha256
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
before.nonBackfillAwardCount = 0
before.retainedBackfillNotifications = 0
before.retainedBackfillReveals = 0
firstPass.playersEvaluated = allowlist.count
firstPass.errorCount = 0
postconditions.firstPassNewAwards = firstPass.awardsCreated
postconditions.evaluationModeBackfill = true
postconditions.matchingNotifications = 0
postconditions.matchingReveals = 0
secondPass.playersEvaluated = allowlist.count
secondPass.awardsCreated = 0
secondPass.errorCount = 0
postconditions.secondPassNewAwards = 0
postconditions.secondPassZero = true
postconditions.databaseAttestationUnchangedAfterFirstPass = true
postconditions.databaseAttestationUnchanged = true
postconditions.gitAttestationUnchanged = true
```

Production's initial execution expects no baseline Badge awards. A retry after
a partial attempt may retain valid awards, but every retained award for the
frozen cohort must have `source_metadata.evaluationMode = "backfill"`. Any
non-backfill baseline count fails with
`PRODUCTION_BASELINE_AWARD_MODE_MISMATCH`.

The apply must re-run the read-only database attestation after pass one and
must not begin pass two if count/hash or candidate status changed. It re-runs
the same attestation after pass two. A change fails with
`DATABASE_ATTESTATION_CHANGED_AFTER_FIRST_PASS` or
`DATABASE_ATTESTATION_CHANGED_DURING_BACKFILL`, respectively. Valid awards
already committed remain valid, but the cutover is not accepted.

The notification/Reveal checks cover the **entire retained backfill cohort**,
not only current-run deltas. `postconditions.validatedBackfillCohortAwards`
must equal the retained cohort count that was actually inspected. This permits
a clean retry after partial writes while preventing a historical notification
or acknowledgement from being hidden by delta-only evidence.

## Required natural Recruit outcome

Complete all retry/idempotency and cohort checks before any allowlisted player
visits Dashboard. For an existing legitimate Production player whose already
verified data satisfies the complete IronClad Recruit rule, require:

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

Once a retained award has been naturally acknowledged, the runner's preflight
cohort gate will intentionally reject it. Therefore never begin Dashboard
acceptance while an apply retry or postcondition investigation remains open.

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
   non-backfill metadata, any matching historical notification or Reveal,
   first-pass errors, or a nonzero second pass as a blocker.
5. Fix the underlying tooling, application, credential, identity, availability,
   or stable-window issue under review. Renew authorization if
   `releaseSourceHead`, `productionHead`, `applicationTree`, `toolingHead`, the
   tooling base/diff, deployment, candidate bytes, target state, or scope
   changes.
6. Retry only the existing `backfill` path over the same still-valid frozen
   IDs. Uniqueness on `(player_id, badge_slug)` preserves valid awards and
   prevents duplicates. Acceptance still requires a clean pass followed by an
   immediate zero-award pass and full retained-cohort validation.

There is no automatic award rollback. Correct historical awards are immutable
entitlements; deleting them can cascade presentation state and destroy audit
evidence. Rolling back the application deployment is a separate Owner
decision and does not justify deleting correct ownership. If an award is
proven incorrect, stop and obtain a separately reviewed corrective procedure.

## Completion record

- Current Production mutation total: **zero required while HOLD remains**
- Release-cutover Owner authorization: pending
- Exact 18-migration Production ledger/apply evidence: pending
- Frozen PR #88 release source head: `ac612018...`
- Approved application tree: `6ba0e3b...`
- Post-merge `productionHead` / `origin/master`: pending
- READY canonical Vercel `gitSource.sha` and smoke evidence: pending
- Reviewed tooling head/tree/base/diff scope: pending
- Automated runner/dry-run test evidence: pending
- Staging live candidate/apply: **not performed; no genuine candidate attested**
- Production global-open/candidate/exclusion counts: pending
- Production fileSha256/playerIdsSha256: pending
- Production read-only preflight and retained-cohort baseline: pending
- Separate backfill Owner authorization: pending
- Production first pass / immediate zero pass: pending
- Production post-apply database/notification/Reveal evidence: pending
- Natural Production Recruit Dashboard journey: pending
