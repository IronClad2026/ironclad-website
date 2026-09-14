# Player Showcase Phase B: Combat Highlights

This change is for Staging review. Production is not configured. Phase A PR #126
was merged into `staging` as `c92a27872a1bebbde71922de3fad89c2f15fb370`;
Phase B starts from that commit on `codex/player-showcase-phase-b-combat-highlights`.
Current Thought and Featured Badge presentation and authority are unchanged.

## Architecture and privacy

Supabase owns the three fixed player slots, pending/ready lifecycle, immutable upload
IDs, verified metadata, rights declaration v1, reports and moderation holds. Direct
table mutations are denied. Clerk-authenticated RPCs derive ownership; completion,
moderation and cleanup use narrowly scoped service-only RPCs behind server checks.

The browser sends video directly to the Staging Worker, which requires both a short
P-256 signed reservation and a real Clerk JWT in headers. The private R2 binding
accepts an immutable object once, with an exact size and content type. The Next.js
server reads at most 15 MB once for verification. It does not proxy public playback
or transcode. Replacement keeps the previous ready clip until verification succeeds.

Every public video, poster, HEAD and Range request checks current database eligibility:
active account, public profile enabled, current ready clip, correct ownership, no
moderation hold, both feature flags enabled. Owner preview also rechecks current
ownership using Clerk authentication. No authorization decision or media is publicly
cached. Turning a profile private immediately denies new requests; already delivered
bytes cannot be recalled. Tokens never appear in URLs. Worker failure affects clips,
not competition, badges or the rest of Player Showcase.

Deleted, replaced, expired and closed-account assets enter durable cleanup work.
Cleanup runs opportunistically before reservations/after actions and through the
admin retry control. There is no scheduled background service in V1: physical R2
deletion requires activity or an admin retry. Revocation is immediate regardless.
Upload deadlines and a cleanup grace period prevent an in-flight upload recreating
an object after deletion. Quotas include undeleted assets and limit reservations.

## Media and interface

Limits are 3 slots, 15,000,000 bytes, 15 seconds, 1920 x 1080 and 60 fps.
MP4 accepts AVC/H.264 with optional AAC; WebM accepts VP8/VP9 with optional
Opus/Vorbis. No MOV, HEVC, AV1, transcoding, Stream or processing infrastructure.
Mediabunny 1.56.2 plus bounded container/codec/frame-header checks validate bytes,
packets and the full timeline. This is not full entropy decoding or content moderation.
The intentionally conservative unsupported subset and timestamp tolerance are
documented in `tests/fixtures/combat-highlights/README.md`.

An optional local JPEG poster is generated in the browser and fully decoded with
Sharp 0.35.4 on verification. Posters are stored privately and separately. If extraction
is unavailable, the player sees the normal play surface without a poster.

`/dashboard/showcase` supports upload, preview, replace, delete and reorder. The
public profile renders nothing for zero clips and balanced 16:9 layouts for 1/2/3,
stacked on mobile. Gameplay uses object-contain, native controls/fullscreen, no
autoplay, preload none and a video source only after interaction. Only one clip plays
at once. Clips are labelled player-submitted CoH3 gameplay, not official footage.
V1 copy is English; Phase A translations are unchanged. Optional match links are deferred.

## Staging resources and configuration

- Supabase: `ironclad-staging`, `zzbnneprhjicmajpjkdg`.
- Cloudflare account: `cbe0a3809d7429e07e97e3795803182b` (existing IronClad account).
- Private bucket: `ironclad-staging-combat-highlights`, APAC, **Standard**.
- `r2.dev` disabled; no bucket custom domain or public URL.
- Worker: `ironclad-staging-combat-highlights`, **Workers Free**.
- Worker URL: `https://ironclad-staging-combat-highlights.ironclad-website.workers.dev`.
- No Workers Paid, Stream, Infrequent Access or Production resource is configured.

R2 Standard includes a free allowance but usage beyond that allowance is billable;
this is not an unlimited-free promise. Workers remain on the Free plan. Request/storage
quotas and no autoplay reduce usage. Do not activate a paid plan or recurring product
without the user's approval. Check actual account usage before widening the rollout.

Branch-specific Vercel Preview keys (names only):

- `COMBAT_HIGHLIGHTS_WORKER_URL`
- `COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK` (sensitive, never readable in source)
- `COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS` (exact verified Preview origins)
- `PREVIEW_LEGAL_DOCUMENT_ORIGIN` and `PREVIEW_LEGAL_DOCUMENT_ORIGINS`
  inherit the normal Staging legal flow through branch-specific copies of configuration.

Existing Preview Clerk/Supabase secrets are inherited, not copied or downgraded.
The Worker has only `SIGNING_PUBLIC_JWK` and `SUPABASE_PUBLISHABLE_KEY`; no
service-role key. `wrangler.jsonc` pins the Staging account/bucket/database, defaults
`ENABLED=false`, and requires exact origins for browser writes. The Next.js media
configuration also fails closed for Production or an unexpected database/Worker URL.

`scripts/configure-combat-highlights-staging.mjs` provisions the five branch-scoped
Preview settings and the Worker's two key bindings using official authenticated CLIs.
It is an initial provisioning operation, not an automatic rotation/upsert tool: inspect
existing keys before repeating a partially completed run. The branch must already
exist on GitHub. Values stay in process memory/child stdin; never print or commit them.

## Migration and rollout checkpoint

New additive migration: `20260913235133_player_combat_highlights.sql`.
SHA-256 (LF): `99b319d9d478db2fabd3110434efe69e50da65b234b189de21e81edee17e5b8f`.
It creates the new tables/RPCs and a **disabled** `player_combat_highlights` setting.
It preserves the existing account-closure chain while adding private-media cleanup.
Never rewrite/replay the already applied Phase A migrations or historical Staging aliases.

At initial source publication: the private bucket and disabled Worker exist; Phase B
is not yet applied to Staging, and branch Preview configuration is pending publication.
Phase A remains enabled. Update the PR deployment notes after each rollout step.

Before activation: verify the exact migration ledger and protected-table fingerprints;
apply only the new migration; run the guarded Staging transaction/rollback contract;
compare fingerprints and advisors; configure the actual Preview origin; deploy the
current Worker; verify fresh authenticated owner/public/private media authorization.
Keep Phase B off until these checks pass. Use actual Clerk Staging sign-in and the
normal legal gate. A real clip upload requires the player's truthful rights declaration.
Do not fabricate acceptance or use fixture footage as a player's real gameplay.

## Validation completed before publication

- `npm run lint`: passed (one unrelated existing DeleteAccountSection warning).
- `npx tsc --noEmit`: passed.
- `npm run test:unit`: 153 files / 1,704 tests passed.
- `npm run test:integration`: 174 files / 1,717 tests passed.
- `npm run build`: passed (Next.js 16.3.3).
- Local PGlite PostgreSQL: 131 assertions passed; 71 Staging-script assertions
  separately exercised locally. The local baseline deliberately stubs existing legal
  and closure functions and does not prove hosted Postgres 17 behavior or concurrency.
- Focused migration/history/inventory: 65 tests passed.
- Isolated Chromium UI/browser checks: 12 passed, including desktop/mobile 0/1/2/3
  layouts, actual local fixture playback/upload, lazy loading and one active player.

The full app gates used synthetic loopback-only CI configuration. Browser fixtures
block external/API traffic and use licensed public test media. No exploratory fixture
is connected to a live database. The Staging contract is a single guarded BEGIN/ROLLBACK
transaction and must be accompanied by independent before/after protected-table hashes.

Hosted Clerk/upload/playback/Range/revocation, provider Free-plan CPU behavior and real
mobile-device codec support remain required. Local fixtures do not substitute for those
checks. Do not merge the Phase B PR or perform a Production release without review.
