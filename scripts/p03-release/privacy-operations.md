# Match Room privacy operations

This is an operator procedure, not a public export endpoint. No Production
privacy operation is executed by preparation, the release gate, or deployment.
The privileged command verifies the acting user's current Clerk admin role;
the service-only RPC also requires that actor's active database profile. Public,
anonymous and ordinary authenticated callers cannot invoke these RPCs.

## Approved retention and operational ownership

The authorized tournament/privacy administrator reviews the bounded retention
preview daily and performs eligible cleanup. Routine content expires **40 days
after authoritative current tournament closure**, never individual Match finish.
Completed, cancelled and voided events use their trustworthy existing closure
authority. A missing closure timestamp or currently reopened event blocks routine
purge and requires an authority review; operators must not invent a date.

Formal association comes only from system assistance/dispute/no-show state or a
verified external case reference explicitly linked to the affected room. Existing
Privacy Policy 1.2 section 18 controls the longer periods: support, complaint,
privacy and Admin Assistance material follows 24 months after case closure;
dispute, no-show and competition-integrity material follows 24 months after the
authoritative result becomes final. Open cases remain protected. No command
classifies message text or changes a tournament/result lifecycle.

Holds identify only the affected room or explicit message IDs, a real case UUID,
and legal, security, abuse/safety or competition-integrity purpose. Every hold
has a future expiry no more than 366 days away; review necessity regularly and
release promptly. A documented renewed hold is a separate operation. After a
hold ends, ordinary eligibility resumes; daily maintenance removes overdue
eligible material within the existing policy's 30-day maximum.

## Private configuration and authority

Load these names privately into the command's process environment:

- `P03_PRIVACY_SUPABASE_URL`: exact approved project HTTPS origin.
- `P03_PRIVACY_SERVICE_ROLE_KEY`: that project's service credential.
- `P03_PRIVACY_CLERK_SECRET_KEY`: Development for Staging, live for Production.
- `P03_PRIVACY_ADMIN_CLERK_USER_ID`: the verified acting administrator.

No app environment file is loaded automatically. Production and Staging keys
cannot be interchanged. Identity verification for the subject of an access or
erasure request follows the existing privacy procedure; do not ask them for
passwords or authentication codes. Locate by verified player UUID. For a request
combined with closure, the authorized operator records that existing player UUID
in the private privacy/closure case **before closure**, using the authenticated
account/admin lookup. The existing closure RPC returns only an outcome, not that
UUID. Historical participant registration provenance may retain the UUID; an
administrator without competition history may have no player row after closure,
although retained authored messages keep the minimum non-content author UUID.
The saved case reference can locate those messages without retaining or restoring
Clerk attribution. For an already closed account, use an existing verified case,
registration or prior export reference. Do not promise that erased identity can
be reversed, and never search/classify message text to guess the subject.

The CLI writes only to a **new absolute directory outside the candidate**. It
rejects symlink ancestors, creates POSIX mode 0700 or a Windows current-user-only
directory ACL, and uses exclusive-create files. Private body exports are never
console output or ordinary CI artifacts. Review other participants' rights before
secure delivery; membership of a room does not authorize disclosure of unrelated
rooms. Apply the existing case/backup retention process to private exports.

## Preview, locate and export

Request files contain only the documented IDs, dates and categories, never
credentials. An empty object previews the first bounded page of up to 100
retention candidates. Continue with `{"afterRoomId":"RETURNED_NEXT_ROOM_UUID"}`
when `nextRoomId` is present, using a new output directory per page. Blocked/held
rooms may appear but do not stop pagination; preserve their reason for review.
Explicit `roomIds` cannot be combined with a cursor:

```powershell
node scripts/p03-release/privacy.mjs preview --project-ref PROJECT_REF --request C:/Private/P03/preview-request.json --out C:/Private/P03/preview-NEW
```

Other read requests:

| Command | JSON request fields | Limit |
| --- | --- | --- |
| `locate` | `playerId`, optional `afterRoomId`, `limit` | 100 linked rooms |
| `export` | `playerId`, `roomId`, optional `afterSequence`, `limit` | 500 messages from that linked room |

`locate` returns counts and room IDs. Explicit export additionally requires
`--include-bodies`, writes `private-export.json`, and returns a sequence cursor
when another page may exist. Each page needs its own reviewed request and new
private output directory; no unbounded auto-pagination occurs. Export includes
only message ID/order, sender category, whether the subject authored it, body and
timestamp. It excludes Clerk IDs, proof paths and unrelated profiles.

```powershell
node scripts/p03-release/privacy.mjs locate --project-ref PROJECT_REF --request C:/Private/P03/locate-request.json --out C:/Private/P03/locate-NEW
node scripts/p03-release/privacy.mjs export --project-ref PROJECT_REF --request C:/Private/P03/export-request.json --include-bodies --out C:/Private/P03/export-NEW
```

## Explicit maintenance or privacy-request changes

Each mutation requires `--execute` and the exact approval phrase
`APPROVE P03 STAGING PRIVACY COMMAND` or
`APPROVE P03 PRODUCTION PRIVACY COMMAND`, with the command uppercased. The phrase
is an operational guard; it does not grant authorization by itself. Current
preparation authorizes no Production mutation.

| Command | JSON request fields | Boundary |
| --- | --- | --- |
| `purge` | `roomIds` | 1–100 reviewed rooms; database rechecks current eligibility |
| `hold` | `roomId`, `messageIds` or null, `caseReference`, `reason`, `expiresAt` | Up to 1,000 specific messages or only the affected room |
| `release-hold` | `holdId` | Releases the named hold idempotently |
| `link-case` | `roomId`, `caseReference`, `caseKind`, `closedAt` or null | Verified formal external case only; null means open |
| `redact` | `playerId`, `roomId`, `messageIds` | Only that subject's authored messages; active holds/formal retention block ordinary redaction |

External case kinds are `support`, `complaint`, `privacy`, `abuse_security`,
`dispute`, `no_show`, and `competition_integrity`. Support-case closure is a
verified event, not today's date chosen for convenience. Result-related cases
still use authoritative final-result time. Re-linking the same case may record
verified closure/reopening but cannot change its class. There is no erase-case
shortcut around retention.

Preview the intended batch before `purge`; write its exact room UUIDs to the
request. Purge deletes at most 1,000 eligible messages per room per call. Inspect
the returned counts and repeat a reviewed explicit batch if content remains,
then continue preview pagination. Do not edit held/competitive state just to
obtain purge eligibility.
SQL maintains the authoritative checks and serializes cleanup with holds,
account closure and lifecycle operations. Redaction preserves a non-content
placeholder/identity needed for safe message retries. Neither command deletes
tournament results, brackets, registrations, standings or competitive authority.

Every command writes an intent before its single RPC, then a checksum-bound
private receipt. Database audit records contain operation classes, counts,
references and actor provenance, not message bodies. A network error has an
uncertain outcome: preserve the intent and inspect the affected metadata before
an explicitly reviewed retry. The CLI never automatically retries a mutation.

## Account closure and minimum footprint

Existing account closure revokes access/messaging immediately, removes private
read state and direct account-linked notification/communication attribution.
Free-text messages are **not** represented as anonymized. Their legitimate
routine/formal-case retention continues until eligible cleanup.

Purge removes expired communication content and unnecessary private cursors,
resolved communication notification episodes/notifications and obsolete
assistance attribution where the database retention policy permits it. Minimal
non-content room identity, generation/pair provenance and operation audit counts
remain where needed to prevent history recreation, support idempotency and
preserve competitive authority. No old room becomes writable through cleanup.

Old backups follow the existing maximum rolling 90-day backup lifecycle.
Restoring a backup requires reapplying completed erasure/pseudonymization and
retention obligations before normal access; logical restore does not undo those
obligations. Legal successor publication and fresh current-account acceptance
must complete while Match Room remains OFF, before any Production activation.
