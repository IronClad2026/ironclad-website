# IronClad Repository Instructions

## Project

IronClad is a Company of Heroes 3 tournament platform built with Next.js 16
App Router, React 19, strict TypeScript, Clerk, Supabase PostgreSQL and Storage,
Tailwind CSS 4, Framer Motion, GSAP, and Lenis.

Treat the current source and migrations as authoritative. `README.md` and
`PROJECT_CONTEXT.md` may be stale.

## Before Working

1. Inspect `git status`, the active branch, configured worktrees, and the
   relevant files before proposing or making changes.
2. Consult official or bundled Next.js 16 documentation when changing routing,
   caching, proxy/middleware, Server Actions, or framework configuration,
   especially when behavior is uncertain. Bundled documentation is under
   `node_modules/next/dist/docs/`.
3. Verify required environment files and variable names exist without printing,
   copying, or otherwise exposing secret values.
4. Do not modify or copy ignored recovery-backup directories.
5. Do not assume the live Supabase project has every committed migration.
6. Do not expose values from `.env.local`, Clerk secrets, Supabase service-role
   keys, tokens, signed URLs, or private proof paths.

## Worktrees and Branches

- Never implement directly on `master`.
- Every implementation task must use an isolated Git worktree.
- Before committing, every implementation worktree must be attached to a
  clearly named feature branch, not a detached HEAD.
- Keep the original `ironclad-website` folder clean for integration and final
  testing.
- Do not merge, push, deploy, or modify production data without explicit
  approval.
- Preserve unrelated user changes and never reset, clean, delete, or overwrite
  them.
- Do not create a branch, worktree, commit, or pull request unless the task
  authorizes it.

## Partner and Parallel-Work Coordination

- Before editing a high-conflict file, identify whether the partner's active
  branch may touch the same file or contract.
- Report conflicts and logical integration risks immediately; do not wait for
  the final handoff.
- After the partner's branch is merged into `master`, active feature branches
  must fetch and merge `origin/master` before continuing substantial work.
- Nominate exactly one migration owner for each parallel work batch. Migration
  ownership is batch-specific and must not be permanently assigned to a role or
  agent.
- Agents who are not the nominated migration owner must document their schema
  requirements and coordinate with that owner before editing
  `supabase/migrations`.
- Avoid simultaneous edits to shared contracts and monolithic feature files.

Suggested three-agent boundaries, adjustable per task:

1. Competition/data: bracket and match workflows, database contracts, and
   server-side tournament operations.
2. Identity/player: profile, dashboard, public players, registration, ELO, and
   notification services.
3. Presentation/admin UX: pages, components, styling, admin presentation, and
   documentation.

These boundaries do not imply permanent migration ownership. Each parallel
batch must explicitly nominate its migration owner.

## Next.js Rules

- This is Next.js 16, not an older App Router implementation.
- Use the Next.js 16 Promise-based `params` and `searchParams` conventions.
- Prefer Server Components unless browser state or browser APIs are required.
- Treat every Server Action and Route Handler as an externally callable
  endpoint.
- Authenticate, authorize, and validate inside every mutation.
- `middleware.ts` is deprecated in Next.js 16. Consult the official or bundled
  proxy migration documentation before changing it.
- Preserve configured Server Action body-size behavior and reconcile it with
  upload limits when changing proof or avatar uploads.

## Authentication

- Clerk is the source of session identity.
- Admin access is `sessionClaims.metadata.role === "admin"`.
- Navigation visibility is not authorization.
- Repeat admin authorization in every privileged page, Server Action, Route
  Handler, and server-only helper.
- Supabase RLS expects the Clerk user ID in the JWT `sub` claim.
- Never trust client-supplied Clerk IDs, player IDs, roles, statuses, ELO
  values, registration ownership, or agreement state.

## Supabase

Use the narrowest client suitable for the task:

- `lib/supabase.ts`: public publishable-key reads only.
- `lib/supabase-server.ts`: Clerk-authenticated user access.
- `lib/supabase-browser.ts`: browser access with a Clerk token.
- `lib/supabase-admin.ts`: trusted server-only service-role access.

Never import the admin client into a Client Component or expose the
service-role key.

Service-role calls bypass RLS. Every service-role query must authenticate the
caller where applicable, authorize the operation, validate all input, apply
explicit ownership and scope filters, and avoid returning private database
fields to public components.

## Database Changes

- All schema changes require a new timestamped migration.
- Never edit an already deployed migration merely to change current behavior.
- Keep migrations ordered and review the latest definition of any function
  being replaced.
- Prefer explicit transactions where supported.
- Include relevant constraints, indexes, RLS policies, grants, and storage
  policies.
- Revoke function execution from `public`, `anon`, and `authenticated` unless a
  role genuinely requires it.
- Set a safe `search_path` on security-definer functions.
- Do not run migrations or destructive database commands without explicit
  approval.
- Do not use dynamic text replacement of stored function definitions for new
  migrations; replace functions explicitly.
- Only the explicitly nominated migration owner may edit
  `supabase/migrations` during a parallel work batch. Other agents must record
  and communicate their required schema changes first.

## Domain Invariants

Preserve these database-enforced rules:

- One registration per player per tournament.
- Registration windows and tournament status control availability.
- Bracket capacity and waitlist FIFO order.
- ELO bracket eligibility.
- COH3 profile ownership uniqueness.
- Approved roster locking after competition begins.
- Bracket regeneration safety.
- Match participant and official-result audit history.
- Replay uniqueness and required replay counts.
- Confirmation and dispute deadlines and no-show handling.
- Tournament lifecycle and leaderboard recalculation integrity.

Do not rely on UI checks for these invariants.

## Environment and Local Testing Safety

- Verify required environment files and variable names exist without
  displaying their values.
- Never commit `.env.local`.
- Before any database mutation, determine whether the worktree is configured
  for a local, preview, or production Supabase project.
- Never run production migrations, destructive database commands, or live
  webhook tests without explicit approval.
- Use different ports when multiple development servers run simultaneously.
- Never point exploratory or automated tests at production data.

## Privacy and Storage

- `match-proofs` is private and must remain server-mediated.
- Never make proof object paths public.
- Avatar paths contain Clerk user IDs; use the player-ID avatar proxy.
- Account deletion affects Clerk, PostgreSQL, and Storage and is not a single
  transaction. Changes require explicit privacy and recovery review.
- Preserve historical tournament records intentionally and document which
  personal identifiers remain.
- Agreement acceptance changes require versioning, timestamps, and identity
  attribution.

## Coding Conventions

- Use TypeScript strict typing and the `@/` import alias.
- Follow existing double-quote, semicolon, and two-space formatting.
- Use `import "server-only"` for sensitive server libraries.
- Use typed action-state results with `useActionState` where appropriate.
- Validate FormData and JSON payloads explicitly.
- Revalidate affected routes after successful mutations.
- Prefer existing reusable components before creating new variants.
- Keep the black/orange/zinc visual language unless a redesign is requested.
- Split oversized modules when extending them instead of adding unrelated
  responsibilities.

## High-Conflict Files

Coordinate before editing:

- `components/TournamentsExperience.tsx`
- `app/tournaments/page.tsx`
- `app/tournaments/actions.ts`
- `app/tournaments/match-actions.ts`
- `app/admin/page.tsx`
- `app/admin/tournaments/actions.ts`
- `app/admin/tournaments/page.tsx`
- `lib/tournaments.ts`
- `lib/player-dashboard.ts`
- `lib/notifications.ts`
- `lib/notification-events.ts`
- `lib/leaderboard/**`
- `supabase/migrations/**`
- `middleware.ts`
- `app/layout.tsx`
- `app/globals.css`
- `package.json`
- `package-lock.json`

## Verification

After application-code changes, normally run:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Add focused tests when a test framework is introduced.

For database changes, also verify migration ordering and repeatability, RLS and
grant behavior, service-role-only RPC permissions, domain invariants, and
storage cleanup and failure recovery.

Report every check that was not run. Do not claim success based only on stale
documentation or previous build output.

## Completion Report

Every agent must report:

- Changed files.
- Added or modified migrations.
- Added or changed environment variables, naming keys only and never values.
- Added, removed, or updated dependencies.
- Commands executed.
- Checks passed, failed, or skipped.
- Known risks and unresolved assumptions.
- Possible overlap with other active branches.

## Git Safety

- Preserve unrelated user changes.
- Never implement directly on `master`.
- Keep the original `ironclad-website` folder clean for integration and final
  testing.
- Do not reset, clean, delete, merge, commit, push, deploy, or run migrations
  unless explicitly authorized.
- Keep recovery backups ignored.
- Inspect branches and worktrees before parallel work.
