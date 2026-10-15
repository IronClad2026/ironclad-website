# Performance Phase 2

This application-only change starts from Production
`154b1372318296637b850958d358d20106b29783`. Competition, identity, privacy,
legal, media, and database authority remain the functional contract. No
migration, dependency upgrade, new cache, paid service, or feature change is
required.

## Measurements and scope

The fresh baseline uses 30 serial warm anonymous HTTP samples per public route,
plus a separate first observation. The first observation is not asserted to be
an infrastructure-cold start. These measure complete HTML/RSC responses, not
browser paint or click latency. Baseline HTML medians include Tournaments
2,032 ms, tournament detail 2,041 ms, brackets 2,259 ms, Rankings 1,060 ms, and
Players 1,018 ms. Actual Production traces resolve through Sydney to `iad1`;
the Production database is in Singapore. Controlled, identical-source regional
probes must reach the same backend and validate the same response before a
region decision. Gateway-only 401 responses cannot establish database latency.

The fixed 30-attempt comparison reached the same read-only public entitlement
RPC and required HTTP200 / false for each response. All 180 measured responses
passed. Production backend p50 / p95: `iad1` 299.682 / 504.012 ms, `hnd1`
111.156 / 319.946 ms, `sin1` 55.022 / 221.523 ms. Singapore improves the median
81.64% and P95 56.05% against Virginia, meeting the materiality gate. The same
experiment against the Tokyo Staging backend favors `hnd1`; it is not used as
a substitute for Production evidence. The application uses one Production
compute region, `sin1`, while preserving the existing cleanup cron. No
multi-region architecture or paid infrastructure is introduced.

Native browser component tests separately measure loaded-panel commit latency,
URL/history behavior, and server-refresh delivery. Synthetic delayed-query
benchmarks isolate scheduling: the career loader keeps all 14 queries and the
same complete output while reducing eight sequential query waves to five;
the owner profile keeps its three reads while reducing three waves to two.
The Admin System history projection likewise keeps its three scoped reads and
complete DTO, reducing three waves to two with identical partial-error behavior.
Those are scheduling proofs, not claimed Production milliseconds.

Baseline and optimized builds use the same source baseline, toolchain, and CI
dummy environment. Initial route JavaScript (raw / gzip bytes) changes as
follows:

| Route | Before | Optimized |
| --- | ---: | ---: |
| Rankings | 513,764 / 154,430 | 502,547 / 150,683 |
| Players | 498,251 / 151,822 | 483,659 / 147,044 |
| Showcase | 403,675 / 116,406 | 397,272 / 114,814 |

The public-profile route's own chunk separately decreases from 96,989 /
29,762 to 81,902 / 25,181 bytes by using the same focused player fallback.
The full English dictionary and all eight locale presentations remain equal.

## Equivalence boundaries

- Same-event tournament presentation uses Next.js 16's supported native history
  integration. All tabs/panels retain a fresh server authority refresh in the
  background, while presentation commits immediately. Actual Next16 testing
  proved that a native panel push can interrupt another component's pending
  refresh. Zero-RSC overview navigation is therefore not retained: avoiding
  server work cannot justify losing an authority update. Cross-event selection
  and canonical replacements retain normal router navigation. Deep links,
  reloads, Back/Forward, and rapid navigation require regression coverage.
- Tournament polls and result projections start together only after their
  dependencies are available. Report groups/submissions and subsequent replay
  evidence/admin audit reads run concurrently within their existing scopes.
  No mutation, authorization check, or privacy filter is removed.
- Career and owner-profile follow-up reads overlap only where independent.
  Dashboard invitation reconciliation and other read paths that write remain
  ordered. Live profiling must not call those paths merely to benchmark them.
- Public-profile metadata and page share one React request-local loader result.
  General public loaders and Server Actions stay fresh. No authenticated
  identity, token, or private data is cached between requests or users.
- English fallbacks are split into focused modules and reassembled unchanged
  for the full dictionary. All eight supported locales retain their labels.
  Players country options recompute on locale changes, not each search key.
- The Highlights editor defers the upload form and local preparation code.
  Its existing dialog/focus/close shell stays available during chunk loading.
  Signing, validation, private R2, Worker authority, moderation, cleanup, legal
  declaration, and all three enabled Production switches are unchanged.
- Animations, artwork, styles, scoring, registrations, season state, Match Room,
  notifications, and legal requirements are preserved. No speculative indexes
  or broad caching are introduced for already-fast PostgreSQL queries.

## Validation and deployment

Run lint, strict TypeScript, unit/integration tests, a production build, public
presentation/navigation and Highlights browser suites. All six exact-head CI
jobs remain required: `validate`, `browser`, `p03-database`,
`p03-hosted-backup`, `consolidated-database`, and
`consolidated-release-safety`. Disposable database tests do not alter hosted
Production or Staging.

Before merging, bind the candidate/tree and unchanged current Production
baseline. After deployment, verify the actual execution region, repeat the same
public HTML/RSC measurements, and exercise native navigation/history plus
authenticated read-only profile/Showcase surfaces. Retain a fresh read-only
comparison of all 42 protected history fingerprints, migration ledger160,
covered function/grant/RLS catalogs, the exact Pro Event1 bridge, and existing
settings. Highlights and Showcase must remain ON. Inspect immediate errors and
HTTP status metrics. Do not submit a registration, result, message, legal
acceptance, or synthetic gameplay declaration as a performance smoke test.

## Recovery

The known good pre-performance application is the enabled Highlights deployment
`dpl_DHAwGn9Km8bVUZrHoFfHE1ZtV6js`, not the earlier disabled deployment.
Keep its Production environment configuration and cron schedule available.
If an optimization causes a regression, restore that application or revert the
specific optimization through the protected Git path. A region-only rollback
restores the captured prior single-region `iad1` configuration. Never restore a
database snapshot, reverse consolidated migrations, disable Highlights, or
rewrite historical facts to undo an application performance change.

Detailed timestamped before/after measurements and operational receipts remain
outside the application source in the local release evidence directory. The
completion report must distinguish actual Production timings, synthetic
scheduling, local browser measurements, and unavailable native browser timing.
