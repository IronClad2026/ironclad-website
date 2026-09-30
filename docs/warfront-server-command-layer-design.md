# WARFRONT Server Command Layer Design

## 1. Executive Summary

WARFRONT commands will be thin, authenticated server adapters over the M1-M15
database authorities. They validate transport shape, derive identity from Clerk,
apply the existing legal gate where required, invoke exactly one canonical
service-role RPC, and return a stable application DTO. They do not decide
membership, role, roster, lifecycle, cancellation, result, settlement, ranking,
retention, or account-closure state.

**Verdict: SERVER COMMAND LAYER DESIGN READY FOR AUDIT**

## 2. Current Repository Architecture

The Next.js 16 App Router app uses Clerk server `auth()`, `proxy.ts` with
`clerkMiddleware`, Server Actions (`"use server"`), and Route Handlers for
transport-specific endpoints. `lib/supabase-admin.ts` is already server-only and
creates the service-role client from `SUPABASE_SERVICE_ROLE_KEY`; public and
Clerk-token clients are separate. The existing legal gate is
`loadAccountLegalGateState` / `requireCurrentAccountLegalAcceptance`. Existing
actions return small typed state objects and log through `logSupabaseError` or
safe `console.error` contexts. No runtime schema validator dependency is
installed; the first implementation must use local explicit TypeScript parsers
unless a separately approved dependency decision changes that.

## 3. M1-M15 Backend Boundary

M1-M15 are the protected state machine. The command layer calls only service-role
API RPCs or the existing public closure RPC. It must never replicate a database
check in TypeScript as authoritative. In particular, M12 owns Company lifecycle
and cancellation; M9 owns results/finalization; M10 owns settlement; M13 owns
safe service-only read projections; M14 owns liveness/recovery; M15 owns
account-closure cancellation of logical-open challenger Operations.

## 4. Authentication / Identity Flow

For user commands, the shared context factory calls Clerk `auth()` and obtains
only the session `userId` (the canonical Clerk ID). It rejects no-session calls.
The Clerk ID is passed as the explicit actor string required by the canonical
WARFRONT API. The database's M7 resolver is the canonical Player and open-account
resolver; it determines missing/closed Player outcomes. The client never supplies
a Player ID, role, membership, Company authority, operation ownership, or legal
state as authority. Input IDs are resource selectors only.

Account closure is different: Clerk identity is required, but no legal gate or
pre-resolved Player is required. It invokes `close_ironclad_player_account` once;
the final M7/M15/M4 database chain owns Player lookup, M15 cancellation,
membership closure, retention, and account state atomically.

## 5. Legal Gate

Before ordinary Player-originated mutations, command context calls the existing
`requireCurrentAccountLegalAcceptance()` guard. The database repeats legal
acceptance checks, so this is UX/fail-closed server protection, not a replacement
for M4/M12/M9 authority. Account closure is explicitly exempt. Public reads,
public profile/ranking/Combat Record reads, and internal maintenance do not use a
Player legal gate. Admin commands require Clerk admin claims and retain the
database's canonical M7 admin-actor mapping.

Authentication, Player/open-account existence, legal acceptance, and command
authorization stay separate outcomes.

## 6. Command Taxonomy

| Category | Command/RPC | Caller | Legal gate | Idempotency |
|---|---|---|---|---|
| Company | create, invite, revoke, accept/decline invitation, leave, remove, promote/demote, transfer, archive | signed-in Player | yes | M12 conditional writes / duplicate responses |
| Operation | issue, accept, explicit cancel | signed-in Player | yes | M3/M12 state and evidence checks |
| Operation result | submit result, confirm result, dispute result | signed-in locked-roster Player | yes | M9 receipts/finalization checks |
| Room | send chat, mark read, assistance commands | signed-in locked-roster Player or admin where applicable | yes for Player mutations | M6-M8 message/read/assistance receipts |
| Account | close account | signed-in owner | no | canonical closure outcome |
| Authenticated reads | M13 current context, discovery, invitations, operations, Room bootstrap/roster | signed-in Player | no mutation gate | read only |
| Public reads | Company profile, rankings, Combat Record | anonymous or signed-in | no | read only |
| Internal maintenance | M9 per-Operation due-result reconciliation; M14 batch due-result reconciliation, expiry, settlement reconciliation | trusted internal scheduler/service only | no Player gate | M9/M14/M10 receipts |
| Admin maintenance | M14 accepted-abandoned recovery; retention/admin Room operations | Clerk admin only | no Player gate | M14/M8 state checks |

There is no standalone "leave Operation" RPC in M1-M15. The supported open
challenger-roster exit is Company leave/remove, which invokes M12 cancellation.

Due-result reconciliation is never a Player command. Player intent is limited to
submit, confirm, and dispute. Those canonical M9 Player authorities may invoke
the locked due-state reconciliation helper where the database requires it; that
internal implementation detail does not authorize a Player-facing reconciliation
command. `public.reconcile_warfront_operation_result_if_due_api(uuid)` and
`public.reconcile_due_warfront_operation_results_api(integer)` are trusted,
service-role internal maintenance APIs and must not appear in the ordinary Player
command registry, a Player Server Action, Route Handler, frontend control, or
authenticated-user API.

## 7. Canonical Command Contract

Use typed command-specific functions, not a browser-selectable generic dispatcher
endpoint. Their shared internal shape is:

```ts
type CommandResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: WarfrontCommandError; correlationId: string };
```

Each function accepts only a small DTO of selectors and user-entered content.
It derives the Clerk actor itself. `requestId` is optional diagnostic correlation
metadata, bounded/validated and never an authority credential or new persistence
system. Database-provided `duplicate` fields remain the business idempotency
signal and are preserved in DTOs.

## 8. Validation Layers

1. Transport adapter validates `FormData`/JSON primitives, size, UUIDs, enums,
   arrays, and text bounds.
2. Command parser builds a narrow DTO; no authority fields are accepted.
3. Shared context authenticates Clerk.
4. Ordinary Player commands invoke the existing legal guard.
5. The service-role RPC receives Clerk identity plus selector DTO.
6. M1-M15 remain final authority for Player state, Company state, roster,
   ownership, lifecycle, time, locking, and writes.

No command may do read-then-decide authorization in TypeScript.

## 9. Error Taxonomy / Mapping

Normalize safe errors without returning raw PostgreSQL detail/hint:

| Database/source | Application code |
|---|---|
| local input / `22023` | `VALIDATION_ERROR` |
| absent Clerk session | `UNAUTHENTICATED` |
| legal guard required/unavailable | `LEGAL_REQUIRED` / `LEGAL_UNAVAILABLE` |
| `42501` | `FORBIDDEN` or opaque `NOT_AVAILABLE` where disclosure-sensitive |
| `P0002` | `NOT_FOUND` or opaque `NOT_AVAILABLE` |
| `55000` | `LIFECYCLE_CONFLICT` |
| `40001`, `PT409`, deadlock/serialization transport | `CONCURRENCY_CONFLICT` |
| transport/config/unexpected | `INTERNAL_ERROR` |

The response includes stable code, safe message, retryability, correlation ID,
and any explicitly safe domain data. Server logs retain the serialized database
error only; browser responses do not expose SQL internals.

## 10. Idempotency / Retry Model

Do not add a request-id table. M1-M15 already implement business idempotency via
unique constraints, immutable receipts, conditional writes, and `duplicate`
responses. Request/correlation IDs are observability only. A timeout after a
database commit is ambiguous: client retry is allowed, and the canonical RPC
determines duplicate/safe terminal behavior. HTTP is not claimed to be exactly
once. Notification idempotency remains the database event-key design.

## 11. Concurrency Model

One command normally makes one RPC call. The command layer never creates a
multi-RPC pseudo-transaction, nor does it pre-read to authorize a mutation. M3,
M12, M14, and M15 advisory/row locks and conditional updates remain the race
authority. A user workflow containing several commands comprises several
independent authoritative transactions.

## 12. Service-Role Boundary

Only server-only modules import `createSupabaseAdminClient()`. The service key is
server environment only and never accepted from requests, serialized into props,
or named `NEXT_PUBLIC_*`. Command/read modules use the admin client solely for
the explicitly granted M1-M15 API RPCs. Browser clients retain publishable-key
scope and cannot execute protected RPCs because database grants revoke them.

## 13. Route Handler vs Server Action Decision

Prefer shared server command functions as the implementation core. Thin Server
Actions are the default transport for first-party form/UI mutations, matching the
repository. Add Route Handlers only when an external/internal caller, non-form
JSON client, webhook, or scheduler requires HTTP transport. Both adapters call
the same command function. Do not create a broad `/api/warfront/command`
dispatcher; it increases CSRF and command-routing surface without current need.

Server Actions use Next/Clerk same-origin action protections. Future Route
Handlers must be same-origin/session authenticated for user endpoints, validate
method/content type/body size, and use the existing Clerk/proxy access model.
No redundant CSRF system is proposed absent a concrete cross-origin route.

## 14. Read Architecture

Public-safe M11/M13 reads may remain narrow public RPC-backed server reads where
their contracts permit. M13 service-only authenticated reads are mediated by
server-only read functions: Server Components call them directly; client refresh
needs use a thin Server Action or authenticated Route Handler that calls the same
function. Read DTOs are explicit projections, not generated database-schema
types. UI reads never authorize writes.

## 15. Room / Chat Architecture

Use existing M6-M8 RPCs for chat send/history, M7/M8 read cursor and assistance,
and M13 Room bootstrap. Player command context supplies only Clerk identity and
input. The database preserves locked-roster, post-leave historical access,
closed-account rejection, retention, purge/redaction, and unread behavior.
Admin Room commands require Clerk `sessionClaims.metadata.role === "admin"` at
the server boundary and still use canonical M7 admin actor resolution.

## 16. Admin / Maintenance Boundary

User commands and maintenance never share a transport. M9 per-Operation
due-result reconciliation (`public.reconcile_warfront_operation_result_if_due_api`)
and M14 batch due-result reconciliation
(`public.reconcile_due_warfront_operation_results_api`), expiry, and settlement
reconciliation are internal-only invocations from a trusted scheduler or server
worker. A service-role RPC being reachable from server-side code does not make it
a Player command: ordinary Player command registries, Server Actions, Route
Handlers, and frontend controls must never request arbitrary Operation due
reconciliation. Accepted-abandoned recovery is admin-only: server verifies the
canonical Clerk admin claim, then passes Clerk identity to M14. It never accepts
an admin actor ID from the client. Retention actions follow the same rule.

## 17. Account Closure Architecture

The account-closure Server Action authenticates Clerk, validates the existing UI
confirmation, and invokes exactly `close_ironclad_player_account(userId)` through
the server-only client. It must not independently resolve/close membership,
cancel Operations, or delete WARFRONT records. M7/M15/M4 retain their single
database transaction. Clerk deletion/storage cleanup remains a separate existing
privacy workflow and must report partial cross-system failure truthfully.

## 18. Observability

Log command name, correlation ID, elapsed milliseconds, normalized outcome, and
safe error class. Do not log tokens, service keys, Clerk tokens, chat bodies,
legal document content, raw private account data, or raw request payloads.
Reuse `serializeSupabaseError` server-side with a bounded command context.

## 19. CSRF / Transport Security

Use authenticated Server Actions for first-party mutations. Keep `proxy.ts` and
Clerk session protection in force. A future Route Handler must authenticate from
the Clerk session/cookie, never a client-provided actor ID, and must reject
cross-origin use unless a separately designed trusted integration requires it.

## 20. Rate-Limiting Considerations

No rate limiter is introduced in this design. Future review targets chat send,
assistance creation, invitation/create/issue attempts, public discovery, and
maintenance invocation. Any limiter must not replace M1-M15 authority or create
new state races.

## 21. Type Safety

Define discriminated input/output/error DTOs per command and exact RPC argument
and response adapters. Use local parsers/type guards initially; do not add Zod or
another dependency without approval. Do not expose complete table row types.

## 22. Proposed Module Structure

Future only; no files are created by this design:

```text
lib/warfront/
  server/client.ts                 # server-only admin RPC client facade
  commands/context.ts              # Clerk, legal gate, admin context
  commands/errors.ts               # normalization
  commands/company.ts
  commands/operation.ts
  commands/room.ts
  commands/account.ts
  commands/admin.ts
  reads/authenticated.ts
  reads/public.ts
  contracts.ts
app/warfront/.../actions.ts        # thin Server Action adapters when UI exists
app/api/internal/warfront/...      # only future trusted scheduler/integration routes
```

## 23. Security Invariants

1. Browser roles cannot call protected service-role RPCs.
2. Clerk `userId`, never client Player ID, defines the actor.
3. Role/Commander/membership/ownership are database-derived.
4. Legal gate applies to ordinary Player mutations and is repeated by database authority.
5. Company/Operation authority is never reproduced in TypeScript.
6. Settlement, ranking, retention, and maintenance are not normal-user commands.
7. Account closure is one canonical RPC, never an app-side workflow replica.
8. M13 service-only reads are server mediated.
9. Public reads use only explicitly safe projections.
10. Admin commands require both Clerk admin boundary and canonical database actor mapping.
11. M9/M14 due-result reconciliation is trusted internal maintenance, never an
    ordinary Player command merely because its RPC is service-role callable.

## 24. Failure Model

Clerk failure returns `UNAUTHENTICATED`; legal lookup failure is fail-closed as
`LEGAL_UNAVAILABLE`; RPC domain errors are normalized; concurrency errors are
retryable; unknown/network failures are `INTERNAL_ERROR`. After an uncertain
timeout, refresh/read state or retry the same canonical command; never assume it
failed or re-create business logic client-side.

## 25. Implementation Phases

1. Server-only WARFRONT client facade, Clerk/legal/admin context, errors, DTOs,
   and one simple Company command with tests.
2. Remaining Company and invitation commands.
3. Operation issue/accept, Company leave/remove-triggered cancellation where
   applicable, explicit challenger cancellation, submit result, confirm result,
   and dispute result. Do not add a Player-facing due-result command.
4. Room/chat/read-cursor/assistance adapters.
5. Account-closure adapter integration with existing deletion workflow.
6. M13 authenticated read adapters and Server Component integration.
7. Internal M9/M14 reconciliation, M14/admin/retention adapters, with scheduler
   transport review.

## 26. Open Questions / Explicit Non-Goals

- Confirm the intended scheduler host and authentication for M14 when implementation begins.
- Confirm whether WARFRONT UI needs JSON routes in addition to Server Actions.
- Confirm product rate-limit thresholds before adding infrastructure.
- This design does not add a database migration, request-id store, generic command endpoint,
  new chat system, new authorization model, or client-side service-role access.

## 27. Design Verdict

SERVER COMMAND LAYER DESIGN READY FOR AUDIT
