# IronClad Project Context

## Project Purpose

IronClad is a Company of Heroes 3 esports tournament platform. Its intended
scope includes:

- Player accounts and competitive profiles
- Tournament discovery and registration
- Registration review and administration
- Tournament, bracket, roster, and match management
- Seasonal rankings and IronClad Tournament Points
- Future competitive community and media features

The repository currently represents an early functional platform. Player
accounts, profiles, registration submission, player status tracking, basic
admin review, and database-backed tournament creation/editing exist. Bracket
operations, match management, and rankings are still prototypes.

## Tech Stack

- Next.js 16.2.6 using the App Router
- React 19.2.4
- TypeScript 5 with strict mode
- Tailwind CSS 4
- Clerk for authentication and session management
- Supabase for PostgreSQL data and avatar storage
- Framer Motion for animation
- Lucide React for icons
- ESLint 9 with the Next.js Core Web Vitals and TypeScript configurations

Important: this version of Next.js contains breaking changes compared with
older versions. Before changing Next.js behavior, read the relevant local
documentation under `node_modules/next/dist/docs/`.

## Repository Structure

```text
app/
  about/                 Public information page
  admin/                 Protected registration administration page
    tournaments/         Protected tournament creation and editing page/actions
  dashboard/             Protected player dashboard
  profile/               Protected profile page and Server Actions
  rankings/              Rankings placeholder
  rules/                 Interactive rules page
  sign-in/               Clerk sign-in route
  sign-up/               Clerk sign-up route
  tournaments/           Tournament UI and registration Server Action
  globals.css            Tailwind import and global overrides
  layout.tsx             Clerk provider, navbar, footer, and metadata
  page.tsx               Public homepage

components/
  Shared navigation, footer, account, profile, tournament, and hero components

data/
  Static homepage tournament data

lib/
  Supabase clients, Supabase configuration, profile types/completion logic,
  and shared animation configuration

public/
  Brand images, tournament images, and official rules/PPA PDFs

middleware.ts
  Clerk route protection. Deprecated by Next.js 16 in favor of `proxy.ts`.
```

There are currently no route handlers, API routes, generated Supabase types,
automated tests, or CI configuration. Supabase migrations are stored under
`supabase/migrations/`.

## Routing And Data Flow

Public routes:

- `/`
- `/about`
- `/tournaments`
- `/rules`
- `/rankings`
- `/sign-in`
- `/sign-up`

Protected routes:

- `/dashboard`
- `/profile`
- `/admin`

`middleware.ts` treats all routes not listed as public as authenticated routes.
Individual protected pages and every implemented Server Action also perform
their own authentication checks.

The main data flow is:

1. Clerk authenticates the user and manages the session.
2. Application code obtains the Clerk user ID and session token.
3. Authenticated Supabase clients forward the Clerk token to Supabase.
4. Supabase Row Level Security is expected to authorize user-scoped access.
5. Server Components load records and Server Actions perform mutations.

## Authentication Flow

Clerk is initialized through `ClerkProvider` in `app/layout.tsx`.

Sign-in and sign-up use Clerk's prebuilt `SignIn` and `SignUp` components.
Clerk session state is accessed through:

- `auth()` in Server Components and Server Actions
- `useAuth()` in Client Components
- `clerkClient()` for permanent Clerk account deletion

Admin access is based on this session claim:

```ts
sessionClaims.metadata.role === "admin"
```

The navbar uses this role only to decide whether to display the Admin link.
The admin page and its mutation action repeat the role check on the server.

The repository does not contain:

- Clerk webhook synchronization
- The Clerk JWT template configuration used by Supabase
- The process for assigning or revoking admin roles
- Role audit history

These are external operational dependencies and must be documented before
production use.

## Supabase Setup

Environment variables currently expected:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Supabase clients:

- `lib/supabase-server.ts`: authenticated server client that forwards the
  current Clerk token.
- `lib/supabase-browser.ts`: authenticated browser client that receives
  Clerk's `getToken`.
- `lib/supabase-admin.ts`: server-only service-role client used during account
  deletion.
- `lib/supabase.ts`: plain publishable-key client currently used by the admin
  dashboard.

The application assumes Clerk JWT integration with Supabase RLS. No SQL
migrations, RLS policies, indexes, constraints, triggers, functions, or storage
policies are committed, so the database cannot currently be reproduced or
fully security-audited from this repository.

## Database Tables Currently Used

### `players`

Columns referenced by application code:

- `id`
- `clerk_user_id`
- `display_name`
- `in_game_name`
- `discord_username`
- `steam_username`
- `coh3_player_card_url`
- `country`
- `region`
- `timezone`
- `current_elo`
- `avatar_url`
- `bio`
- `profile_completed`
- `created_at`
- `updated_at`

Expected database requirements:

- Unique constraint on `clerk_user_id`
- RLS limiting players to their own record
- Suitable validation constraints for ELO and text lengths

### `tournaments`

Database-backed tournament configuration, including title, slug, description,
banner, dates, status, format, prize pool, and optional rules/Battlefy URLs.

### `tournament_brackets`

Main and Challenge bracket configuration with ELO rules and maximum player
capacity.

### `registrations`

Columns referenced by application code:

- `id`
- `clerk_user_id`
- `player_name`
- `discord_username`
- `steam_name`
- `coh3_player_card_url`
- `country`
- `region`
- `timezone`
- `submitted_elo`
- `tournament_title`
- `bracket_name`
- `registration_status`
- `elo_status`
- `admin_notes`
- `created_at`
- `tournament_id`
- `tournament_bracket_id`

Known registration statuses:

- `pending`
- `manual_review`
- `approved`
- `rejected`

Known ELO status currently written:

- `pending`

### Storage

Avatar storage uses the `player-avatars` bucket and this object path:

```text
{clerkUserId}/avatar
```

The profile stores a public URL for the avatar.

## Player Profile System

Authenticated users can create or update a player profile at `/profile`.

The profile form collects:

- Avatar
- Display name
- In-game name
- Discord username
- Steam username
- CoH3 player-card URL
- Country
- Region
- Timezone
- Current ELO
- Optional biography

`savePlayerProfile` validates all submitted values on the server. It also
validates avatar MIME type, maximum size of 2 MB, and basic file signatures for
JPEG, PNG, and WebP.

The player record is upserted using `clerk_user_id` as the conflict target.

Profile completion requires:

- An avatar
- A display name or in-game name
- Discord and Steam usernames
- A CoH3 player-card URL
- Country, region, and timezone
- An integer ELO between 0 and 5000

The form itself requires both display name and in-game name, making the
completion helper slightly less strict than profile submission.

The homepage and player dashboard load the profile and calculate completion
again instead of trusting only the stored `profile_completed` flag.

## Tournament Registration System

The public `/tournaments` route loads tournaments and brackets from Supabase in
a dynamic Server Component, then passes them into the existing cinematic Client
Component. The original demo tournament is used only when no database
tournaments can be loaded. Archive, participant, bracket visualization, media,
and announcement content still includes prototype data.

Registration flow:

1. The user selects Register.
2. Client code verifies that the user is signed in.
3. An authenticated browser Supabase query checks for a complete player
   profile.
4. A modal asks the user to select a tournament and bracket.
5. The modal displays the stored player profile.
6. The user accepts four agreements.
7. `submitTournamentRegistration` repeats authentication and profile checks.
8. A snapshot of the player's current profile is inserted into
   `registrations`.
9. The new registration starts with `registration_status = "pending"` and
   `elo_status = "pending"`.

The four agreement values are checked but are not stored in the database.

The dashboard loads registrations belonging to the signed-in Clerk user and
displays their status, submitted ELO, submission date, and relevant admin note.

## Admin Dashboard System

The `/admin` page verifies that the Clerk session role is `admin`.

It currently:

- Loads all registrations
- Calculates status counts in memory
- Filters registrations by status in memory
- Opens a selected registration using query parameters
- Approves registrations
- Rejects registrations
- Marks registrations for manual review
- Saves admin notes

Rejection and manual review require an admin note. Notes are limited to 1000
characters and are shown to the affected player.

After a status mutation, the action calls:

```ts
revalidatePath("/admin");
revalidatePath("/dashboard");
```

Tournament creation and editing are implemented at `/admin/tournaments`.
Bracket management, player database tooling, and ELO verification remain
preview modules.

## Account Deletion

Account deletion requires the user to enter `DELETE`.

The action uses the Supabase service role to:

1. Anonymize historical registration identity fields.
2. Remove the avatar.
3. Delete the player record.
4. Delete the Clerk user.

Historical tournament records remain with a generated anonymous identifier.
The operation is not transactional. A failure during a later step can leave a
partially deleted account.

## Known Bugs And Security Risks

### High Priority

1. The admin page checks the Clerk role but uses the unauthenticated
   publishable-key client from `lib/supabase.ts` for database reads and writes.
   Proper RLS should reject these operations because Supabase cannot identify
   the Clerk administrator. Policies broad enough to permit this client would
   risk exposing registration data or admin mutations.

2. Registration accepts client-supplied tournament titles and bracket names.
   The Server Action checks only that they are non-empty. A caller can submit
   arbitrary tournament or bracket values.

3. There is no server-side duplicate registration, capacity, registration
   window, tournament status, or bracket eligibility enforcement visible in
   the repository. Database constraints may exist externally but are not
   version controlled.

4. RLS and storage policies are absent from the repository. Security behavior
   cannot be verified or reproduced.

### Other Risks

- The production build emits a Clerk runtime warning because the tournament
  page constructs an authenticated browser Supabase client during server
  rendering. `useAuth().getToken()` is browser-only.
- `middleware.ts` is deprecated in Next.js 16 and should eventually become
  `proxy.ts` after reviewing the bundled Next.js documentation.
- Account deletion is a multi-system, non-transactional workflow.
- Agreement acceptance is not persisted or versioned.
- Country, region, and timezone are length-checked but not validated against
  server-owned allowed values.
- Hardcoded timezone offsets become inaccurate under daylight-saving changes.
- Avatar files are publicly accessible.
- Admin notes may preserve personal information after account anonymization.
- There is no rate limiting, abuse prevention, admin audit log, or notification
  system.
- Admin registration loading has no database pagination or server-side filter.

## Current Technical Debt

- `app/tournaments/page.tsx` is approximately 1160 lines.
- `components/PlayerProfileForm.tsx` is approximately 820 lines.
- `app/admin/page.tsx` is approximately 740 lines.
- Tournament data is duplicated between `app/tournaments/page.tsx` and
  `data/currentTournaments.ts` and is already inconsistent.
- `components/TournamentCard.tsx` appears unused.
- A disabled `if (false)` ELO section remains in the tournament registration
  UI.
- Database row types and column selections are manually repeated.
- No generated Supabase database types exist.
- Shared UI patterns such as heroes, cards, badges, avatars, and value displays
  are duplicated.
- The design system is implicit in repeated Tailwind utilities rather than
  centralized tokens and variants.
- Some source text contains encoding corruption such as `Â·`, `Â©`, and
  malformed symbols.
- There are no unit, integration, end-to-end, authorization, or RLS tests.
- There is no CI pipeline, deployment runbook, monitoring, or operational
  documentation.
- The default `README.md` still contains Create Next App boilerplate.

## Recommended Roadmap

### High Priority

1. Commit Supabase schema migrations, constraints, indexes, RLS policies, and
   storage policies.
2. Replace admin Supabase access with a server-side client that securely carries
   the Clerk admin identity, or use a narrowly scoped privileged service layer.
3. Create database-backed `tournaments` and `brackets` tables with stable IDs.
4. Validate tournament eligibility, registration windows, bracket selection,
   capacity, and duplicate registration on the server.
5. Add unique database constraints and transactional/RPC registration
   operations.
6. Persist agreement type, version, acceptance timestamp, and user identity.
7. Add automated authorization and mutation tests before expanding features.

### Medium Priority

1. Build tournament CRUD and publishing.
2. Build bracket assignment and ELO verification workflows.
3. Add admin audit logs and registration history.
4. Add database pagination, search, filters, and bulk operations.
5. Add player/admin notifications.
6. Make account deletion idempotent and recoverable.
7. Generate TypeScript types from the Supabase schema.

### Lower Priority

1. Add seasons, points, rankings, standings, teams, rosters, matches, and
   result reporting.
2. Split oversized feature files into cohesive modules.
3. Consolidate shared UI components and design tokens.
4. Fix source encoding and accessibility details.
5. Add CI, observability, deployment documentation, and environment validation.

## Rules For Future Codex Sessions

1. Read `AGENTS.md` before doing any work.
2. This is Next.js 16, not an older Next.js implementation. Read the relevant
   guide under `node_modules/next/dist/docs/` before changing Next.js APIs,
   routing, caching, Server Actions, authentication boundaries, or file
   conventions.
3. Inspect the current worktree and relevant files before proposing changes.
   Do not assume this document is newer than the code.
4. Do not expose, print, commit, or copy values from `.env.local`, `.clerk/`, or
   any service-role or Clerk secret.
5. Never use the Supabase service-role key in Client Components or browser
   code.
6. Treat Server Actions as externally callable endpoints. Authenticate,
   authorize, and validate every action independently of the page that renders
   its form.
7. Never trust client-supplied tournament IDs, bracket IDs, player IDs, roles,
   statuses, ELO values, or agreement state without server validation.
8. Prefer database constraints and RLS for invariants and ownership. UI checks
   are only usability features.
9. Any schema change must include a migration, updated RLS policies, generated
   types, and tests.
10. Preserve historical registrations carefully. Account deletion and
    anonymization changes require explicit review for privacy, consistency, and
    recovery behavior.
11. Keep admin reads and mutations server-side and ensure Supabase receives an
    identity or privilege level that matches the Clerk authorization decision.
12. Avoid adding another hardcoded tournament dataset. Establish one
    server-owned source of truth.
13. Follow existing styles for small changes, but split files when extending
    oversized modules rather than adding more unrelated responsibilities.
14. Do not remove or overwrite unrelated user changes in a dirty worktree.
15. Run at least `npm.cmd run lint` and `npm.cmd run build` after application
    code changes. Add focused tests for behavioral changes.
16. Document any check that could not be run and any external database or Clerk
    assumption that could not be verified.

## Current Verification Baseline

At the time this context document was created:

- Git worktree was clean.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- The build reported the deprecated `middleware.ts` convention.
- The build reported the browser-only Clerk `getToken()` runtime warning from
  tournament-page Supabase client construction.
