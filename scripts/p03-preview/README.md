# Disposable P03 Preview fixture

`create-fixture.mjs` prepares a **new Staging-only** Main event using the eight
existing immutable `TestMain1`–`TestMain8` player fixtures. Default execution is
read-only planning. It never reprovisions players, edits an old event, changes
settings or migrations, invokes an outbound worker, or calls a Production API.

## Execution hold

Do not run creation until the separately reviewed dedicated Development Clerk
admin exists and a fresh browser session proves `metadata.role === "admin"`.
The script independently verifies its exact Clerk backend identity contract.
Creating privileged test access is currently waiting for explicit user approval
following an automatic approval-review rejection.

The existing Staging email cron is active. Its current worker must be verified
through the authorized read-only review; a candidate Preview with email disabled
does not by itself establish the cron worker's configuration. Reviewing the
Vault-derived worker identity is also waiting for explicit user approval.
Do not retry that blocked inspection through another mechanism.

No external mutations have been performed by this script.

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
pass. The authoritative `save_tournament` RPC checks Main ranked-cycle
availability under its advisory lock at creation time.

After the holds are resolved, a reviewer records fresh worker evidence in a
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
quarterfinals, and an empty final. No room history is manufactured.

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

The twenty guard/layout tests do not load environment files or make network
requests. Live planning and creation remain unrun while the approvals are
pending.
