# Production release queue

## P04 — Official CoH3 News

**Release destination:** planned post-tournament Production release.

**Delivery scope:** Staging only. This entry travels with the Staging feature
merge and does not authorize or prepare a Production deployment.

- Public `/news` with recent Relic posts from the official CoH3 Steam RSS feed.
- Two-item homepage teaser; grouped desktop/mobile navigation and More menu.
- Eight-locale UI, English source content, direct official images and fallback.
- Normalized hourly Next.js cache; no Supabase changes, cron, CMS or notifications.
- Implementation and verification boundaries: [Official CoH3 News](official-coh3-news.md).

Keep P04 in Staging until the separate planned Production release is approved.
