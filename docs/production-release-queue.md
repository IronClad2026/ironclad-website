# Production release queue

## P03 — Match Room

**Delivery scope:** Staging only; Production release remains separately gated.

- Existing private Match Room messaging, read cursors, notification episodes,
  assistance, historical routing and database kill switch.
- Private unread Match-card attention indicator: the current participant's
  actionable pairing gains an orange ring and localized message action until
  the authoritative room read cursor catches up. No message preview or public
  unread projection is added.
- Implementation, lifecycle rule and verification evidence:
  [Unread Match-card attention](match-room-unread-card-indicator.md).

This enhancement belongs to P03, not a new release package. The P04 scope and
release destination below are unchanged.

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
