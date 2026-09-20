# Match Room browser fixture

Run from the repository root:

```sh
npx playwright test --config tests/browser/match-room/playwright.config.ts
npx playwright test --config tests/browser/match-result/playwright.config.ts
```

The fixtures start isolated Vite servers on `127.0.0.1:3137` (Match Room) and `127.0.0.1:3127` (result regression). Real MatchRoom, MatchRoomAssistanceControls and MatchResultControls components use a synthetic action transport. No database, authentication secret, push provider or hosted project is accessed. Tests reject requests to other hosts.

Scenarios: default player, `?scenario=admin`, `closed`, `unavailable`, `outsider`, `historical`, and `history`. History contains 125 messages. The `notifications` scenario uses browser localStorage solely to share synthetic messages and generic notification episodes between two local fixture tabs; `viewer=player`, `opponent`, and `replacement` select the simulated viewer.

Coverage:

- 375/390 px layout, 44 px assistance controls, wrapping author names, long Unicode text and plain-text rendering.
- Lost-response idempotent retry, focus refresh, failed-history preservation, and retained result/replay drafts.
- Two earlier pages, chronological order without duplicates, scroll-anchor preservation, and unchanged private read cursor when loading older messages.
- Real assistance controls: request, duplicate request, explicit admin resolution, and participant reopening, without changing result/replay controls.
- Generic one-episode notification presentation across two fixture tabs, exact-room return, no sender self-alert, and denied replacement access without current-room fallback.
- Existing result/replay workflow at 360/390/412/430/1280 px, confirmation/dispute controls, expiry, admin-review and automatic-result states.

Artifacts are separated under `test-results/match-room/` and `test-results/match-result/` so one suite cannot erase the other suite's screenshots.

These fixtures verify browser behavior with mocked authority. Server-action, notification, and PostgreSQL tests independently verify actual ownership, unread-episode coalescing, immutable membership and assistance authorization. The fixture does not prove real device push delivery. Chromium viewport emulation does not establish native phone keyboard behavior; that remains manual UAT.
