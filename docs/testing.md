# Automated validation

IronClad's default local validation is fast and fixture-driven. Vitest does not
start Supabase, use Production data, apply migrations, or contact live external
services.

## Canonical validation

Run:

```text
npm run validate
```

This runs ESLint, strict TypeScript checking, and the complete Vitest unit and
integration suite. Run the Production build separately with `npm run build`.
The GitHub CI workflow installs from the committed lockfile and runs lint,
strict TypeScript, Vitest, and the Production build.

Targeted commands:

```text
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage
npm run test:e2e:list
npm run test:e2e
```

Coverage is collected for visibility; no percentage threshold is enforced.

## Safety boundaries

- Unit and integration tests use synthetic anonymous, player, and administrator
  identities.
- Supabase and Clerk access is mocked. Test setup rejects inherited remote
  Supabase URLs and live Clerk keys.
- MSW treats every unhandled HTTP request as an error.
- Playwright aborts non-loopback browser requests. Its browser interception does
  not cover requests made server-side by Next.js.
- Tests do not read `.env.local` or call live Clerk, Supabase, Relic, email,
  payment, or AI services.
- Approved real Staging contract checks are separate controlled rollout work;
  they are not part of the default local suite.

## Browser smoke tests

`e2e/public-smoke.spec.ts` contains the public-route smoke definitions. The
`/players` directory is public and its smoke test expects the Players Directory
to render anonymously.

Next.js 16 request matching is implemented by the root `proxy.ts`. It delegates
the public-route decision to `lib/route-access.ts`, where `/players`, public
player profiles, and the public avatar proxy are included. Lookalike paths such
as `/players-private` remain protected.

Playwright browser execution is available through `npm run test:e2e`, but it is
not currently part of the GitHub CI workflow. Use `npm run test:e2e:list` when
only discovery validation is required.

## Deferred validation

The following require a separately approved environment or phase:

- local Supabase orchestration, database resets, and database fixtures;
- pgTAP and live RLS/grant/constraint/trigger/RPC checks;
- Clerk-backed player and administrator Playwright projects;
- browser installation and browser execution in CI;
- E2E database seeding and full-stack replay/Storage workflows; and
- coverage enforcement thresholds.
