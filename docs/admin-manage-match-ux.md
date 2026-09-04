# Admin Manage Match UX

The match dialog now presents one workspace: match identity and official score,
current state, any required review, current result and replay evidence, then
Deadline & Scheduling, Submission History, Advanced Admin Actions and Danger Zone.
Exceptional operations are collapsed by default. A hold or elapsed match deadline
opens scheduling; disputed/under-review reports open review. Pending opponent
confirmation keeps the existing Admin review available as an optional disclosure.

The dialog shell is extracted from `TournamentsExperience.tsx` into
`AdminMatchManagementDialog.tsx`; both existing entry points still use the same
component. `AdminMatchWorkspace.tsx` groups the existing controls. Desktop uses a
bounded 896px workspace with aligned evidence rows. Phones use separate player
rows and scores. The scrollport, safe-area padding, focus trap, opener restoration,
and pending-action close guard remain in the dialog.

No action, mutation, deadline calculation, replay-access route, result authority,
cron, or database schema changed. The existing scoped replay query additionally
projects `claimed_winner_registration_id` so Game evidence displays its persisted
winner. Legacy series replay fallback has no Game winner and is labeled accordingly;
the UI never guesses one. Private storage paths and identity audit fields remain
server-side. Original confirmation and review timestamps remain in Report audit.
Legacy screenshots, notes, review notes and rejected/reset evidence remain available.

Admin match management intentionally uses English, as it did before this change.
The shared player controls retain their translation defaults and dictionaries.
No dependencies, environment variables or migrations are added.

Validation uses isolated fixtures only. The Owner's completed tournament and TEST 2
are never used as test targets. Run:

```text
npm run test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test --config tests/browser/admin-match/playwright.config.ts
```

The browser suite renders the actual dialog and controls with local action stubs,
blocks external requests, and checks 360/390/412/430/1280/1440/2560px. It covers no
report, pending confirmation, dispute, Admin review, expired confirmation, hold,
completed read-only history, every main disclosure, long names/text, reset guards,
keyboard wrapping, close reachability and screenshots. Replay filenames are not
exposed by the existing result projection; protected Game replay links are retained.
