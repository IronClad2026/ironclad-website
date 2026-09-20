# Official CoH3 News — P04

Staging-only implementation from `c074ac29813167e41a330b88803dbd86331967e2`.
Production release remains reserved for the planned post-tournament release.

## Behavior

`https://steamcommunity.com/games/1677280/rss/?l=english` is the only upstream.
The server validates and normalizes that feed into at most ten recent articles.
`/news` is public. The homepage shows the two newest articles after the
competition explanation. There are no internal article-detail pages, database
records, schedules, admin controls, client polling or news notifications.

Article title and excerpt remain English (`lang="en"`). UI chrome is translated
in all eight existing locales. Publication dates use an explicit UTC date so
server and browser rendering agree. Categories are conservative title-based
IronClad presentation labels, not Relic classifications.

## Security and content

- A 4.5-second total fetch/body deadline and 512 KiB streamed response limit
  bound the upstream read. Redirects are rejected.
- Strict XML parsing rejects malformed XML, DTD declarations and custom entity
  references. The parser does not load external DTDs or resources.
- HTML parsing is inert. Scripts, styles, embeds and other unsupported content
  are discarded. Only escaped plain text (at most 280 characters) and a
  validated image URL reach presentation; raw RSS and full descriptions are
  never persisted, logged or sent to the browser.
- Articles must have a matching GUID and exact HTTPS URL under
  `steamcommunity.com/games/1677280/announcements/detail/<digits>`.
- Images must use `clan.fastly.steamstatic.com` or
  `clan.akamai.steamstatic.com`, `/images/40883127/` or `/images/46192591/`, a
  40-character lowercase hexadecimal asset name, and JPG, PNG or WebP format.
  Both exact CDN aliases were observed in live Steam RSS responses during
  implementation. No wildcard domain allowlist is used.
- Feed-level capsule art is not used. Tiny, unsupported or untrusted image
  candidates are ignored. Missing/rejected/failed images use the same stable
  16:9 IronClad-designed gunmetal grid fallback.
- Images use `next/image` with `unoptimized`, lazy loading and no-referrer.
  Validated URLs load directly from Steam. IronClad creates no image proxy or
  mirror and makes no global `remotePatterns` or CSP change. Ordinary browser
  caching is controlled by the official CDN. Remote bandwidth remains dependent
  on the source image size; rendered dimensions do not resize downloaded bytes.
- Every article links directly to Steam with `noopener noreferrer`. Attribution
  and the independent-platform disclaimer remain visible. There is no copied
  article page, AI translation or misleading imported `NewsArticle` metadata.

## Cache and failure semantics

`unstable_cache` stores only the normalized public snapshot for approximately
one hour, independently of Clerk identity or locale cookies. Its producer uses
an uncached upstream fetch; errors throw inside the cache boundary so framework
revalidation can retain the last successful snapshot. Only the outer UI-facing
loader catches cold-cache failures and returns `null`. A valid empty channel is
different from a malformed feed or a feed whose articles are all rejected.

Refresh is request-triggered, not a scheduled freshness guarantee. Cache
retention after eviction is not guaranteed. With no usable snapshot, `/news`
shows an unavailable state and Steam link; the optional homepage teaser is
omitted. A separate Suspense boundary keeps it out of homepage core loading.
Tournament, registration, result, Match Room and dashboard loaders do not import
the News service.

The feed is a rolling window, not an archive. Its official CoH3 channel can
contain franchise promotions as well as patches and competitive updates.

## Navigation and indexing

Desktop separates Announcements/News, competition destinations/More, and
account-side controls. About is in More; the logo retains the Home destination.
Dashboard/Admin access and language/account/support controls remain available.
The existing Announcements unread classes and state authority are preserved;
News has neither unread state nor attention/glow styling. Smaller widths use
the grouped navigation dialog rather than shrinking desktop text.

`/news` has aggregator metadata and a canonical for the existing production
origin. Non-production renders explicitly use `noindex, nofollow`; deployment
protection/indexing headers are not weakened. No production deployment is part
of this change.

## Dependencies and verification

`@rgrove/parse-xml@5.0.0` is a small zero-dependency strict XML parser that does
not resolve external entities. `parse5@8.0.1`, already present through the test
DOM dependency, becomes a direct production dependency for standards-compliant,
non-executing HTML extraction. No feed framework is added.

Focused tests cover XML/HTML safety, URLs, ordering/deduplication, body limits,
timeouts, valid/empty/unavailable feeds, normalized-only caching, image errors,
localization, route authorization and metadata. The isolated News browser
harness renders actual components with synthetic auth/feed fixtures and cannot
load a Supabase client. It exercises responsive layouts, user/admin states,
eight locales, unread announcements and More-menu keyboard behavior.

No Supabase migration, environment variable, storage bucket, scheduler or
database mutation is required.
