# Combat Highlights local browser fixture

The fixture compiles the real UI components with synthetic in-memory action replies.
It reads no environment files, refuses service/server imports, and blocks external
and API requests. Playwright reuses the CC0 synthetic VP8/Opus verifier fixture and
serves it through local intercepted media requests. It verifies playback and the
local upload checks without calling the Worker, Clerk, or a database.

Run from this worktree:

`node node_modules/@playwright/test/cli.js test --config tests/browser/combat-highlights/playwright.config.ts`

The harness starts only on `127.0.0.1:3218` with strict port selection and never
reuses an existing server. Screenshots are under `.playwright/combat-highlights`.
Manual gallery rendering is available at `/tests/browser/combat-highlights/`;
the test runner supplies the synthetic media and upload endpoints.

Coverage includes empty public output, 1/2/3 clips, desktop/mobile containment,
no video source or media request before interaction, one playing clip at a time,
native controls, report-dialog dismissal, owner blob preview, and an actual local
file-metadata/poster/upload flow. It does not prove hosted media authorization,
moderation, provider login, public cache behavior, or actual database writes.

New V1 Combat Highlights copy is English. Existing Phase A translations are unchanged.
