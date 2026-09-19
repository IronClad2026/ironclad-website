# Match Room Phase 1

Phase 1 provides the private database and Server Action foundation. It has no visible chat UI.

## Scope and source

- Authorized target: staging only, Supabase `ironclad-staging` / `zzbnneprhjicmajpjkdg`.
- Fresh starting `origin/staging`: `26f351806691713de4a28c851081a8444063c29b`.
- Isolated branch: `codex/match-room-phase-1`.
- The lifecycle decision in `match-room-phase-1-checkpoint.md` was explicitly approved on 2026-09-19. That document records the earlier boundary; it is superseded by this implementation.
- Migration owner for this batch: the match-lifecycle agent; root reviews and delivers. No historical migrations changed.

## Authority and lifecycle

`match_rooms` has an immutable UUID and two fixed registration members. Competition IDs are provenance without cascading foreign keys. Messages and read cursors reference their room with `ON DELETE RESTRICT`. No browser table access, including admin JWTs; all three tables use RLS and FORCE RLS with no permissive policies. Service-role direct room-table access is revoked as well.

Five authenticated RPCs derive Clerk's text `sub` from the JWT: `resolve_match_room`, `get_match_room_history`, `send_match_room_message`, `send_admin_match_room_message`, and `mark_match_room_read`. Every call requires a still-active player profile, including admin calls. Historical access checks the room's original registration membership. Admin access requires exactly `metadata.role = admin`. Neither raw Clerk attribution nor other viewers' read cursors is returned.

Server Actions in `app/tournaments/room-actions.ts` repeat Clerk authentication, validate exact input shapes, use the authenticated Supabase client, and validate narrow response projections. Both send paths repeat current legal acceptance in the action and database. Reads remain available without an acceptance gate. Errors use machine codes suitable for later localization.

A room is resolved lazily only for an authoritative launched division with two valid participants; single elimination additionally requires a positive activation version. Draft, TBD, bye and unavailable pairings cannot create rooms. Current competition state is checked on every operation. Hold, elapsed deadline, pending confirmation and review do not close communication. Completion, official outcomes and terminal tournaments make it read-only. Physical closure for ordinary terminal transitions is lazy; authorization is immediate on every RPC, independent of whether closure has been materialized.

`communication_generation` is additive metadata, defaulting to 1. A narrow participant-change trigger increments it and closes the prior room atomically. A wrapper around the unchanged actual-reset implementation increments it for both SE and RR, including a same-opponent reset. Failures abort the whole operation. Legacy reset implementations cannot be directly executed by browser or service roles. Report reset, hold/release, deadlines and ordinary status transitions do not increment it. Browser roles have no generation UPDATE privilege. Existing service-role competition authority remains trusted.

The renamed reset body and existing account-closure body are preserved verbatim. Generation updates do not trigger result, standings, settlement or advancement column-specific hooks. The existing generic timestamp trigger uses the same transaction time as the reset. No scores, winners, pairings, deadlines, holds, registration eligibility or other existing business rows are backfilled by this migration.

## Persistence and concurrency

Messages preserve exact plain text, require 1–1000 Unicode code points and reject blank content. No editing, deletion, attachments, or rich-text rendering is introduced. A room row serializes sequence allocation. The database limits an actor to 15 new messages per room in a rolling minute. `(room_id, actor_clerk_user_id, client_message_id)` provides idempotency; a reused key with different text/authorship is rejected. Exact retries return the original message and do not consume the rate limit. Retries cannot cross a reset; an exact retry after completion may return the already-persisted message without creating a new one.

Read acknowledgment accepts only an explicit existing sequence and uses `greatest` on conflict. It cannot move backwards or acknowledge a future message. History is bounded to 50 messages, ordered by sequence, with an explicit next cursor. There are no read receipts. Future notifications can use one recipient/room episode and the private cursor, without carrying message text.

An actor-scoped transaction advisory lock serializes every room command with account closure. The existing closure chain runs unchanged, then the wrapper deletes that subject's read cursors and removes direct Clerk attribution from messages. A stale Clerk JWT cannot restore access because the profile must still be active. Room membership and sender registration provenance remain for retained competitive history. **Free-text bodies are not anonymized by pseudonymization and may contain personal information.** No permanent retention policy or automatic body deletion is invented here. Before visible rollout, the retention/purge process and legal wording need explicit review. Existing protected tournament hard-delete rules remain authoritative.

## Database objects

- Tables: `public.match_rooms`, `public.match_messages`, `public.match_room_reads`.
- Column: `public.tournament_matches.communication_generation`.
- Triggers: `match_rooms_protect_record`, `match_messages_protect_record`, `tournament_matches_communication_generation`.
- Six explicit indexes for current room uniqueness, fixed-member access, sender rate checks and identity cleanup, plus primary/unique constraint indexes.
- Nine owner-only `ironclad_private` helpers: `protect_match_room_record`, `protect_match_message_record`, `advance_match_communication_generation`, `match_room_actor`, `match_room_context`, `match_room_access`, `match_room_projection`, `match_message_projection`, `send_match_room_message`.
- Five authenticated public room RPCs listed above.
- Service-only wrappers: `admin_reset_tournament_match`, `close_ironclad_player_account`; preserved owner-only bodies renamed with suffixes `_without_communication_generation` and `_without_match_rooms` respectively.
- All new SECURITY DEFINER functions use `search_path = pg_catalog` and explicit ownership/grants.

## Verification and delivery evidence

Migration `20260919011425_match_room_phase_one.sql` is applied to staging. SHA-256 `eed2aec0caa5f7ca07a48de76b11209e7b1aa337cc9cca7b1f958e32d6ad7753` matches the exact hosted statement. The source filename was reconciled to the canonical version assigned by Supabase; no historical migration was renamed. Local and hosted rollback suites passed 155 assertions each, and all 11 controlled multi-session checks passed. Targeted lint, TypeScript, 67 new action/parser tests, 3 migration tests, 89 existing authority/account tests, and build passed. All 11 captured competition-table counts/fingerprints are unchanged; 284 original public function bodies are unchanged and the two approved wrapper bodies preserve their prior implementations under restricted helper names. Existing 112 matches retain all competition facts with generation initialized to 1. New room tables are empty after rollback. See match-room-phase-1-evidence.json for exact preservation data. PR CI and staging merge remain pending.

Local database setup uses a fresh stock PostgreSQL 17.11 cluster at `127.0.0.1:56591`, isolated from hosted credentials and all previous databases. All 150 preexisting source migrations replayed successfully with `tests/database/local-supabase-replay-prelude.sql`. Temporary replay copies normalize CRLF to LF for existing exact-function hash guards and omit only managed `pg_net`/`pg_cron` extension declarations supplied by the prelude; committed historical SQL is unchanged. This local compatibility surface does not emulate hosted Supabase behavior, so hosted rollback tests remain required.

Commands include `npm ci --no-audit --no-fund`, `npx supabase migration new match_room_phase_one`, focused ESLint, `npx tsc --noEmit`, targeted Vitest, `npm run build`, local `psql` migration/rollback tests, and the local multi-session Node harness. Build uses explicit fake CI environment values and a localhost Supabase URL. No environment variables or dependencies are added or changed; no `.env.local` is copied.

The full application suite is reserved for PR CI, avoiding repeated local full-suite runs. Schema application is forward-only and transactional, not an idempotent migration script intended for manual repeated application.

## Deferred and operational limits

Phase 2 owns chat UI, polling integration, room-scoped assistance presentation, localization and notification episodes. Realtime, presence, typing indicators, global inbox, reactions, attachments, Discord visibility changes and message editing/deletion are excluded. No notification, email or external provider request is generated by the tests.

Admins need an active IronClad profile to use room RPCs. Unknown room IDs and unauthorized callers receive the same database denial. Existing historical rooms are addressable by room ID; a global conversation listing is not introduced. A future retained-history purge must explicitly handle rooms/messages/cursors and cannot rely on a competition-table cascade.

This feature touches reset/account-closure contracts and new migration history. Any parallel branch modifying those authority paths must integrate these wrappers rather than bypassing them. Original master worktree and production are excluded from this task.
