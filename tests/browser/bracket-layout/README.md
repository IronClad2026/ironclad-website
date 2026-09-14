# Isolated bracket layout verification

This fixture mounts the real exported `SingleEliminationBracket`, real deadline
presentation, translations, and application styles. Its match data and selection
callbacks are synthetic. Existing `ui-redesign` test stubs virtualize Server
Actions; an additional guard rejects actual server modules. Environment loading
is disabled. CSP, fetch interception, and Playwright routing prevent external,
API, and mutation requests. It never starts Next.js or writes `.next`.

Run from this worktree after dependencies are installed:

```powershell
$env:CI = "1"
node node_modules/@playwright/test/cli.js test --config tests/browser/bracket-layout/playwright.config.ts
```

Port 3223 is strict and loopback-only. An existing process on that port causes
failure instead of silently selecting another server. No hosted URL is accepted.

The suite covers 8/16-player brackets in public, administrator, and player modes
at 1280, 1440, 2560, 375, and 390 pixels. Match data combines scores/winners,
live deadlines and extensions, holds, waiting opponents, pending review, empty
footer states, one/both TBD, and deliberately long names. Further checks exercise
live footer growth/removal, hover, keyboard callback identity, Russian text at
larger font size, read-only administration, focus styling, and mounted resizing.

Assertions compare actual core rectangles, feeder centroids, SVG path endpoints
transformed into screen coordinates, round baselines, card separation, and
horizontal scroll containment. They do not infer alignment from CSS class names.
Screenshots and failure traces are written beneath `.playwright/bracket-layout`.