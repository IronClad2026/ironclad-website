# Match Room Phase 2 — staging workflow

Baseline: `origin/staging` at `aa3445a6d0b82af72f46e4cd42715e912a624d2b`.
Branch: `codex/match-room-phase-2`. Production is outside this phase.

## Delivered behavior

The existing player Match Workspace contains the shared Match Room before result/replay controls. The existing admin workspace uses the same transcript and the Phase 1 admin-send command. Each history, send and read call retains Phase 1 server/database authorization. Admin room access still requires an active profile.

Messages are plain text, at most 1,000 Unicode code points. A failed send retains its draft and retries the same room/body/client-message ID; confirmed success clears the draft. Room changes discard the previous room's local state. Immutable room links never fall back to a replacement room. Names use fixed room registration membership and existing participant projections; unknown retained participants use neutral labels.

Polling runs approximately every 10 seconds while mounted, online and visible, with focus, reconnect, manual and post-send refresh. It updates communication data only; successful send/read actions do not invalidate tournament/dashboard routes. Incoming messages preserve a scrolled-up transcript and expose a New messages control. The private monotonic cursor advances only after the newest loaded messages have been viewed; there are no opponent receipts.

Initial history is the newest 50 messages. Older-history pagination is deferred and the interface discloses the recent-history limitation. New messages can be fetched in further bounded batches.

Assistance reuses the existing admin notification event with a stable room/revision/requester key and an exact room link into admin tournament match management. Notification dismissal does not create a new assistance cycle. Explicit assistance resolution/reopening is deferred. Original participants can request help for retained completed rooms.

Optional Discord contact uses authenticated immutable-room membership and the existing live public-player privacy projection. There is no registration-snapshot contact fallback. Communication works without Discord.

All eight existing locales have UI copy and concise administrator-visibility disclosure. No formal legal-policy text was changed.

## Verification and reproduction

The browser fixture uses the actual MatchRoom and MatchResultControls components with an isolated in-memory action transport. It does not access hosted Supabase or require secrets. Its persistence assertions represent retained fixture state and idempotency, not a new hosted-database execution claim; Phase 1 staging database evidence remains separate.

Run `npx playwright test --config tests/browser/match-room/playwright.config.ts`. The fixture server uses localhost port 3137. Coverage includes 375/390 px layouts, long names and Unicode/plain-text bodies, lost-response retry without duplication, result score/replay draft preservation, focus refresh, stale transcript retention, read-only/unavailable/denied rooms, pinned history, admin sends and the newest bounded page.

Focused unit/integration suites cover room lifecycle isolation, visible-only polling, read state, eight locales, assistance authority/routing, live Discord opt-in and existing match-result/dice/admin workspace regressions. PR CI is the broad lint/type/test/build gate. Vercel Preview is verified against the candidate commit before staging merge. Browser mobile checks use Chromium viewport emulation; native mobile keyboard/device testing is not claimed.

## Release boundaries

No Phase 2 migrations, environment variables or dependencies are required. No production data or master changes are authorized. No new Realtime, push worker or messaging transport is introduced.

`match.message_received` notifications and unread-episode coalescing are deliberately deferred to preserve the requested usage budget. Assistance notifications alone are adapted here.

Formal retention/legal-policy approval remains a production-release gate. No automatic purge/deletion period is promised or implemented. Admin active-profile requirements and the Phase 1 storage/privacy model remain unchanged.
