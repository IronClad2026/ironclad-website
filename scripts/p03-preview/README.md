# Disposable P03 Preview fixture

`create-fixture.mjs` prepares a **new Staging-only** Main event using the eight
existing immutable `TestMain1`–`TestMain8` player fixtures. Default execution is
read-only planning. It never reprovisions players, edits an old event, changes
settings or migrations, invokes an outbound worker, or calls a Production API.

## Authorization and current evidence

Do not run creation until the separately reviewed dedicated Development Clerk
admin exists and a fresh browser session proves `metadata.role === "admin"`.
The script independently verifies its exact Clerk backend identity contract.
It also requires an existing, nonclosed IronClad profile and genuine immutable
acceptance of the current published/effective Terms and Privacy pair by that
admin account. Planning and creation fail read-only if this evidence is absent.
The helper never creates a profile, accepts terms, or copies acceptance records;
use the normal authenticated UI and the actual consent flow for those actions.
It repeats the account check immediately before the first fixture write.
The user explicitly authorized exactly one dedicated Development admin on
2026-09-23. It was created once and completed a real UI login, admin session
claim check, current Terms 1.1 / Privacy 1.2 acknowledgement and synthetic
profile setup. Credentials stay in the ignored current-user-protected file.

The existing Staging email cron is active. Its current worker must be verified
through the authorized read-only review; a candidate Preview with email disabled
does not by itself establish the cron worker's configuration. The newly authorized
Vault read exposed only the staging alias hostname and expected-path boolean.
That alias resolved to a READY staging deployment, and a fresh Vercel UI check
confirmed TRANSACTIONAL_EMAIL_MODE=disabled for Preview/staging.

The reviewed script created only `P03 Preview Validation 20260923-p03-ready`
on Staging, with all 24 RPCs journaled. It preserved earlier fixtures, used
only TestMain1–8 and verified all generated notification recipients. The
ignored receipt is `p03-artifacts/fixture-20260923-p03-ready.json`.

## Preparation and commands

Use the existing protected Staging environment directory and the separate
protected admin credential file. Never put credentials in command arguments.

- `P03_STAGING_ENV_DIR`: directory holding existing `.env.local` and
  `.env.staging-uat.local`.
- `P03_ADMIN_CREDENTIALS_FILE`: protected dotenv containing
  `P03_ADMIN_EMAIL` and `P03_ADMIN_PASSWORD`. This script only reads the email;
  hosted browser validation uses the password.
- Existing helper keys supply the exact Staging Supabase service role, Development
  Clerk configuration, fixture secret, and eight fixed player identities.

Run planning first after identity prerequisites are satisfied:

```sh
node scripts/p03-preview/create-fixture.mjs --run-id 20260923-reviewed-unique
```

All eight Clerk identities, their private Staging provenance, database identity
links, five active 1v1 maps, absent run slug, and zero push subscriptions must
pass. Read-only Staging metadata inspection confirmed service-role SELECT on
the twelve remaining read tables, including `account_legal_acceptances`,
`push_subscriptions` and `notifications`; no table grants were added.
The authoritative `save_tournament` RPC checks Main ranked-cycle
availability under its advisory lock at creation time.

Before any new fixture operation, record fresh worker evidence in a
private JSON file. The evidence must identify the **actual Staging cron worker**,
not merely the candidate Preview:

```json
{
  "schemaVersion": 1,
  "projectRef": "zzbnneprhjicmajpjkdg",
  "checkedAt": "<verified UTC timestamp>",
  "expiresAt": "<at most 15 minutes after checkedAt>",
  "verifiedBy": "read-only-worker-environment-review",
  "stagingCronWorkerVerified": true,
  "emailMode": "disabled"
}
```

An `emailMode` of `allowlist` additionally requires
`emailAllowedClerkUserIds`, excluding every fixture actor. Never fabricate or
extend evidence timestamps. Normal database triggers may enqueue notifications
for the eight synthetic players; the worker evidence must establish that these
cannot be delivered. The script checks recipient scope after preparation and
does not alter existing delivery settings.

Only after root review and the prerequisite approvals:

```sh
node scripts/p03-preview/create-fixture.mjs --run-id 20260923-reviewed-unique --create --approval "CREATE NEW STAGING P03 FIXTURE" --outbound-proof /private/reviewed-worker-proof.json
```

The script creates one event, enrols and approves eight new registrations,
publishes five existing active maps, generates and assigns the eight-player
bracket, launches it, and finalizes quarterfinals 1–3 through the existing
official-result RPC. The scores, selected from each match's actual best-of
format, are explicitly synthetic test outcomes. This leaves a current
TestMain1/TestMain3 semifinal, a one-player/TBD semifinal, completed
quarterfinals, and an empty final. The creator invokes no Match Room RPC and
performs no direct read of private communication tables. Service-role SELECT
on those tables is intentionally revoked; grants and schema remain unchanged.
The receipt proves the new tournament layout, not room absence. The isolated
database rehearsal verifies no manufactured historical rooms, while hosted UI
validation checks that completed and one-player/TBD matches expose no writable
room controls. Never resolve or create a room merely to inspect its absence.

## Receipt, failure, and cleanup

The ignored `p03-artifacts/fixture-<run-id>.jsonl` journal records intent before
each mutating RPC and success afterward. The final
`p03-artifacts/fixture-<run-id>.json` receipt records Staging project/provenance,
new tournament/bracket IDs, current/TBD/completed/empty match IDs, aliases, and
new registration/player IDs. It contains no email addresses, Clerk IDs,
passwords, service keys, or fixture secret.

RPCs are separate database transactions. The script does not retry uncertain
calls or claim an atomic rollback. An existing slug or journal refuses reuse.
After a failure, preserve the journal and inspect the exact new slug; do not
rerun with another identifier merely to bypass the stop.

Keep the new event until hosted validation finishes. Afterward, use the existing
`void_tournament` RPC **only for the new receipt tournament ID**, with the
dedicated admin actor and a synthetic-fixture cleanup reason. Preserve audit
history; do not delete, reset, or edit earlier fixtures. Voiding releases the
Main cycle for future validation. No automatic cleanup runs.

## Local verification

```sh
node --check scripts/p03-preview/create-fixture.mjs
node --test tests/p03-preview/fixture-guards.mjs
npx eslint scripts/p03-preview/create-fixture.mjs tests/p03-preview/fixture-guards.mjs
```

The twenty-eight guard/layout tests do not load environment files or make network
requests. Live planning and creation passed after explicit authorization and actual
admin onboarding. Final hosted evidence must bind the completed candidate SHA.

## Dedicated administrator lifecycle

The fixed external ID is `ironclad:p03-preview-admin:v1`; creation must never
be repeated to bypass an uncertain outcome. The ignored
`test-results/p03-admin-lifecycle.json` records exact identity, current legal
document IDs/hashes, UI onboarding and cleanup state without credentials.
Retain the sole Development identity for final hosted validation and the future
actual-date Privacy publication candidate's rerun. Its private credentials grant
no Production permissions. Reassess or retire it by 2026-10-07 (14 days after
creation); longer retention needs an explicit new purpose and deadline. Cleanup
has not occurred and must wait for the coordinator's final lifecycle decision.
After final evidence is ready and future fixture creation remains available,
refresh actual-worker proof and void only the receipt tournament through its
authoritative operation. A release-date rerun may require a fresh valid-deadline
synthetic event. Preserve competitive/audit history, and close only this dedicated
account through its ordinary account-closure flow when the coordinator authorizes
retirement. Never delete older fixtures or claim unperformed cleanup.
