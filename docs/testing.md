# Automated validation

IronClad's initial automated validation foundation is intentionally fast and
mock-driven. It does not start Supabase, use production data, run migrations,
or contact live external services.

## Canonical validation

Run the fast local validation command:

```text
npm run validate
```

This runs ESLint, strict TypeScript checking, and the complete Vitest unit and
lightweight integration suite. It does not build the application or start a
browser.

Targeted commands:

```text
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage
npm run test:e2e:list
```

Coverage is collected for visibility only. No percentage threshold is enforced
until the baseline is stable enough to choose a meaningful floor.

## Safety boundaries

- Unit and integration tests use synthetic anonymous, player, and admin
  identities.
- Supabase and Clerk access is mocked. Test setup rejects inherited remote
  Supabase URLs and live Clerk keys.
- MSW treats every unhandled HTTP request as an error.
- The Playwright definitions abort non-loopback browser requests. Playwright
  request interception does not cover requests made server-side by Next.js.
- No test reads `.env.local`.
- No test calls live Clerk, Supabase, COH3Stats, email, payment, or AI services.

## Browser smoke tests

Playwright is configured only for future public-route smoke execution. This
foundation deliberately does not install browsers or execute browser tests in
CI. Use `npm run test:e2e:list` to verify test discovery.

The `/players` smoke contract is marked `fixme`. The page is designed as a
public directory, but `middleware.ts` does not currently include
`/players(.*)` in the public matcher. This branch records the mismatch without
changing production routing or treating the protected behavior as correct.

## Deferred validation

The following require a separate, explicitly approved phase:

- Local Supabase orchestration, database resets, and database fixtures.
- pgTAP, RLS, grants, constraint, trigger, and RPC contract tests.
- Clerk-backed player and admin Playwright projects.
- Browser installation and browser execution in CI.
- E2E database seeding and full-stack replay/storage workflows.
- Coverage enforcement thresholds.
