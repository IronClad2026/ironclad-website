# Match Room browser fixture

Run from the repository root:

```sh
npx playwright test --config tests/browser/match-room/playwright.config.ts
```

This starts an isolated Vite fixture on `http://127.0.0.1:3137/tests/browser/match-room/`.
Real MatchRoom and MatchResultControls components use an in-memory action transport; no database, authentication secret or hosted project is accessed. Tests reject non-localhost requests.

Scenarios: default player, `?scenario=admin`, `closed`, `unavailable`, `outsider`, `historical`, and `history`.

Coverage: 375/390 px overflow and composer checks, long author names and Unicode text, plaintext rendering, response-loss retry idempotency, result score/replay draft retention, focus refresh and stale transcript, pinned historical denial without replacement resolution, admin sender distinction and newest 50-message history.

Chromium viewport emulation does not establish native phone keyboard behavior. Unit/integration tests independently exercise server authorization and lifecycle contracts; these fixtures do not replace Phase 1 hosted-database tests.
