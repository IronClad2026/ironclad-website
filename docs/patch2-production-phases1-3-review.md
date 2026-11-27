# Patch 2 Phases 1–3: local Production review package

Prepared 3 November 2026 after the user cancelled Phase 4. This replacement
contains only tournament registration separation, the scoped shared admin inbox
and private assistance with the confirmed Discord option. It includes no
translation implementation or alternative provider approach.

This is a local review package. No push, merge to master, deployment, remote
database write, configuration change or Production action was performed.

## Preserved baseline and provenance

- Branch: `release/patch2-phases1-3-review`.
- Worktree: `ironclad-patch2-production-phases1-3-review`.
- Original Phase 1/2 candidate:
  `688759c9b4766327a86ece665dbb9bcd320fbee9`, preserving `b86cb0d`.
- Production source baseline:
  `ad3eb5b7aee24878252b52bb483d14adf488764c`.
- The original candidate, Production refs and partner worktrees were not changed.
- No divergent Staging branch was merged. Staging-only test adaptation `c7bf6a3`
  and all Phase 4 implementation commits were excluded.

| Reviewed Phase 3 source | Local review commit | Purpose |
| --- | --- | --- |
| `f4836c3` | `ab4c076` | Private assistance and confirmed Discord help |
| `951662c` | `72bb415` | Require an active linked account for private access |
| `1d878c7` | `f42de46` | Guarded Staging acceptance fixtures/tooling |
| `e1aa047` | `2cf0aec` | Hosted player evidence and safe script output |
| `a0d15ad` | `2b83e89` | Correct requester notification conversation link |
| `e4af0fa` | `2e1b953` | Completed Phase 3 browser acceptance evidence |

All six complete source commits were cherry-picked with `-x`. Their Staging
fixtures remain explicitly Staging-only and must never be executed against
Production or treated as authorization to copy Staging data there.

`1ca0c9d` is a separate test-only repair: only the legacy-assistance browser
scenario previously reviewed in `80aae7b` was carried forward. It seeds a prior
request through the existing fixture transport, verifies duplicate idempotence,
supported admin resolution, absence of retired textless creation/reopening and
preserved score/replay drafts at 375 and 390 pixels. No other hunk, code,
dependency, metadata, action stub or migration from that cancelled phase was
included. This local fixture test does not establish real replay upload or
Storage acceptance.

`324c375` is a second separate test-only repair for
`tests/unit/components/MatchRoomAssistanceControls.test.tsx`. Four stale tests
still expected retired textless request/reopening buttons. The repaired suite
now checks durable legacy history, authorized resolution, same-version resolution
retry, old-room response isolation and absence of creation/reopening controls.
No application component or runtime changed. The identical file was verified
in both the Staging cleanup and this local review worktree.

## Integration boundaries

The sole cherry-pick conflict was the historical migration contract in
`tests/integration/admin-tournament-workspace-contract.test.ts`. It retains the
Production cutoff, its nine later Production migration files, the existing
public-profile migration and only the four intended Patch 2 migrations. Existing
historical hashes and dependency checks remain intact.

Production's metrics type remains unchanged apart from reviewed assistance
labels; Staging's unrelated `publicProfiles` field was not introduced. The admin
browser runtime retains its original Discord export and transport. The ordinary
`MatchRoom` source, browser runtimes/configurations, `package.json`, lockfile and
`.env.example` are byte-identical to the preserved candidate. No translation
route, controls, library, cache migration, credentials or dependencies occur in
this package.

The old Phases 1–4 local review history, including `ef2201d`, was preserved.
Its documentation-only `014557e` marks that package **SUPERSEDED** and unsuitable
for release. No historical application or migration content was rewritten.

## Four prepared migrations

These are byte-identical Git blobs to the reviewed originals. **None was applied
to Production.** The hashes are the committed LF-normalized file bytes.

| Migration | SHA-256 |
| --- | --- |
| `20261101220837_patch2_scoped_registration_review.sql` | `c69e8998124f39dccd05b4c07e83aa18b67c1b30e661f38cba70927ddffcf461` |
| `20261101230355_patch2_admin_inbox_legacy_assistance.sql` | `673e376db5fc924c022b39eb1da9dd64d74775e2aa63af9ee54ed47fce7b2a51` |
| `20261102192200_patch2_private_assistance_conversations.sql` | `2eedac3923c0645e5133e14590c700b36357bbb2b17db6a0f80807d41bfeb922` |
| `20261102195256_patch2_private_assistance_active_actor.sql` | `cee0d9264ae7ee2942df66d91b7e7e3bb72b6b731af697bd488ed5beb939c435` |

Before release, refresh actual Production migration receipts, schema, function
definitions, dependencies and activation order through an authorized read-only
inspection. Staging receipts are not proof that Production has its prerequisites.
The carried local assistance database harness names Staging's foundation file;
it must not be described as a complete Production schema rehearsal.

## Local verification and reused evidence

The only root environment file is tracked `.env.example`. A physical copy of
the original Phase 1 dependency runtime was used without copying environment
files, credentials or recovery backups. Commands use
`scripts/patch2/verify-local.mjs`, which strips inherited application credentials,
supplies inert loopback values and blocks outbound networking.

- Focused registration, inbox, notification navigation, private/legacy
  assistance and existing Match Room checks: **307 tests passed in 20 suites**.
- Both repaired legacy-assistance browser cases passed at **375 and 390 pixels**
  using isolated synthetic loopback fixtures. No hosted requests or real replay
  upload occurred.
- The separately repaired legacy assistance control suite passed **7/7** in
  each worktree, adding a suite that was not part of the earlier 307 checks.
  Earlier unchanged lint/type/build results are reused for this test-only repair.
- Verified four exact migration blobs, preserved original candidate and absence
  of the cancelled phase's source, dependencies, environment keys and migration.
- Full lint passed with two pre-existing unused catch-variable warnings in the
  unchanged `scripts/public-competitive-profiles/rehearse.mjs`.
- TypeScript passed.
- The isolated network-blocked Next.js 16.3.3 build passed. Its route output
  contains the private assistance view and no translation endpoint.
- `git diff --check` passed.

Unchanged Phase 1–3 local database and real Staging acceptance evidence is reused
from the phase documents, including the saved private replies, requester
notifications, status persistence and opponent browser denial. This is not new
Production validation. No full test-suite or hosted database run was performed
for this local package assembly.

## Remaining release requirements

1. Actual replay upload, persistence, authorized byte retrieval and access
   restrictions using a permitted method and a fresh reportable fixture.
2. A second distinct authorized admin login confirming shared team state.
3. Physical-phone testing and the user's manual Staging review.
4. Fresh Production schema/dependency inspection and final review of this
   isolated change set, followed by explicit user approval before release.

Keep Staging email disabled, push blocked and owned synthetic delivery events
suppressed during the separate Staging cleanup and review. Existing records,
messages and fixture history must remain intact. This local assembly changes
none of those remote controls. Never release by merging the entire Staging
branch into Production.
