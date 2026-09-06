# Local UI redesign browser fixtures

Uses actual Tournament and Dashboard components and product styles. Only Next
framework plumbing, authenticated loaders, Server Actions and database clients
are replaced. No auth session, environment file, hosted data or remote mutation
is used. Database clients throw except one exact fake poll read, which returns an
in-memory projection; actions record their name and return an isolated error.
The browser has a same-origin CSP and fetch rejects API/external calls.

Start from the worktree containing this harness:

`node node_modules/vite/bin/vite.js --config tests/browser/ui-redesign/vite.config.ts`

Open `http://127.0.0.1:3187/tests/browser/ui-redesign/`.

Query options can be combined:

- `surface=tournament` (default) or `surface=dashboard`
- `events=1`, `2`, `3`, `4`, or `6` for current-event composition
- `long=1` for long event/player/map names and an intact long description
- `missing=1` for absent event images (map thumbnails are absent in all fixtures)
- `mixed=1` for three Division pools with mixed Frozen/Published states
- `contextMaps=1&events=2&mixed=1` makes the second event's pool names/counts/Divisions distinct for stale-context checks
- `prizes=1` for the conditional Prizes panel
- `ratio=portrait` or `ratio=wide` for test-only artwork with visible edge markers
- `historical=1` for a cancelled event explicitly selected in the URL
- `resolved=1&events=2&mixed=1` for a peer resolved by Division state despite its stored event status
- `locale=ru` for real Russian dictionaries
- `emptyMaps=1` for no published maps
- `pollRefresh=1` for an in-memory eligible poll and refresh regression
- Dashboard: `empty=1`, `noProfile=1`, `accepted=1`
- Dashboard failure states: `careerError=1`, `registrationError=1`, `profileError=1`
- Dashboard: `historicalNotice=1` for a notification targeting a hidden previous registration
- Dashboard: `pendingBadge=1` for an actual queued Badge reveal

Run the browser checks:

`node node_modules/@playwright/test/cli.js test --config tests/browser/ui-redesign/playwright.config.ts`

This harness is under tests, has no Next route and must never become application
runtime fixture infrastructure. It verifies rendered presentation and interactions;
it does not prove real provider authentication, database permissions or mutations.

To validate a different isolated worktree, set the process-only
`UI_REDESIGN_SOURCE_ROOT` to its absolute path before starting Vite. The aliases
then resolve actual product source from that worktree, while all safety stubs and
fixtures remain here. This is test configuration, not an application environment
variable; no `.env` file is read or created. Restart Vite after changing it.
The test-only PostCSS `base` also follows this path so Tailwind scans the same
product source being rendered; computed grid and ordering checks protect it.

For Dashboard checks against a worktree containing the completed Dashboard,
set `UI_REDESIGN_SOURCE_ROOT` to that worktree and `UI_REDESIGN_SURFACE=dashboard`
in the test process, then run the same Playwright command. The default profile
runs Tournament checks. If reusing an already running Vite server, restart it
with the same source path before testing; a process variable cannot change an
existing server's source tree.

The Dashboard profile covers seven viewport widths, six statistics, career tabs,
empty/missing/error states, accepted invitations, failed notification feedback,
repeated same-hash historical navigation, native match details, proof privacy,
and the actual Badge queue arriving while the match viewer is open. Its synthetic
loader refresh uses `window.__uiFixture.showPendingBadgeReveal()`; it preserves
real component state without invoking any provider or application mutation.

Automated checks cover the seven requested viewport widths, event counts and
selection, original artwork containment, long organiser text, conditional panels,
mixed map state, stale event/Division context, keyboard focus cycles, Escape and
backdrop dismissal with focus restoration, and all six Archive destinations.
Visual screenshot inspection remains a separate step using the actual browser.
