# Local UI redesign browser fixtures

Uses actual Tournament and Dashboard components and product styles. Only Next
framework plumbing, authenticated loaders, Server Actions and database clients
are replaced. No auth session, environment file, hosted data or remote mutation
is used. Database clients throw; actions record their name and return an isolated
error. The browser has a same-origin CSP and fetch rejects API/external calls.

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
- `locale=ru` for real Russian dictionaries
- `emptyMaps=1` for no published maps
- Dashboard: `empty=1`, `noProfile=1`, `accepted=1`

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

Automated checks cover the seven requested viewport widths, event counts and
selection, original artwork containment, long organiser text, conditional panels,
mixed map state, stale event/Division context, keyboard focus cycles, Escape and
backdrop dismissal with focus restoration, and all six Archive destinations.
Visual screenshot inspection remains a separate step using the actual browser.
