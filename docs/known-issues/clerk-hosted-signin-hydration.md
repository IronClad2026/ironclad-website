# Clerk hosted sign-in React hydration #418/#423

## Classification and decision

- **Status: OPEN / MONITORING**
- **Severity: P2**
- **Category: Clerk hosted sign-in rendering / React hydration recovery**
- **This is NOT a demonstrated authentication failure.**
- **No Production fix is currently justified.** The exact first SSR/client mismatch remains unidentified.

Keep this issue open as a monitored known issue. “Monitoring” is a triage status, not a claim that continuous telemetry or an automated monitor exists. Do not close it merely because the form recovers or a login succeeds.

Authoritative searchable record: [GitHub issue #121](https://github.com/IronClad2026/ironclad-website/issues/121). Investigation/evidence dates: **September 7–8, 2026**. Last reviewed: **2026-09-08**. This document is the detailed technical companion; the GitHub issue remains authoritative while this Markdown is held on an unmerged documentation branch. Neither record depends on local Codex visualization files.

Evidence below is historical, not a promise of current availability. Future agents must recheck the live site before changing anything. Keep owner-reported functional tests separate from instrumented browser observations and from hypotheses.

## Affected document and exact symptom — observed by Codex

Affected: **https://accounts.ironcladtournaments.com/sign-in**, the separate Production Clerk-hosted Account Portal. This is not IronClad's embedded **https://www.ironcladtournaments.com/sign-in** document.

On September 8, 2026, **02:19:05.409–02:19:05.414 UTC**, a separate tab in the Owner's ordinary Chrome profile reproduced:

- **four React #418 records**;
- **one React #423 record**;
- the same hosted **`index-B4SHO8Ja.js`** signature observed in Codex's in-app browser on September 7.

Stacks originated in `https://accounts.ironcladtournaments.com/assets/index-B4SHO8Ja.js`: the first #418 pair began at `Va` (7:5248), then `bc` (9:15272); the next pair at `za` (7:4911), then `eu` (9:45329); #423 began at `eu` (9:44989).

The hosted page **recovers and renders its sign-in form**. Google **“Last used”** / remembered-method display appears normally. No account identity or credential values were recorded.

#418 indicates an SSR/client hydration disagreement; #423 records recovery by client-rendering the root. Four error records do not identify four unique faulty nodes. The hosted React version is not established by IronClad's dependency lockfile.

Ordinary Chrome was connected through the browser extension. This disproves an in-app-only reproduction, but it does not rule out all shared browser-tooling, extension or profile effects.

The Owner's original embedded sign-in tab was preserved without reload/clearing. It rendered normally; available console records were empty, which cannot establish whether errors occurred before attachment.

## Functional evidence — user-reported

The Owner successfully tested in real Chrome:

- sign-in;
- redesigned Admin Operations access;
- logout;
- sign-in again;
- normal Gmail/remembered-account behavior.

The Owner also reported that a separate real user in Italy successfully tested **Chrome and Edge**, including login, logout, login again and normal remembered-account behavior.

After the captured hosted-page rendering errors, the Owner manually signed in through the hosted flow successfully, returned to IronClad normally, and opened `/admin/operations` without a visible error or redirect loop.

These reports are positive real-user evidence. They are not instrumented traces of every authentication step or proof of universal reliability.

## Post-sign-in verification — independently observed by Codex

In the same connected Chrome profile, a read-only check confirmed:

- `https://www.ironcladtournaments.com/admin/operations` loaded;
- title **IronClad Admin** and heading **Operations & Analytics** rendered;
- Admin navigation rendered;
- no sign-in prompt;
- no access-denied state;
- no application-error state;
- **no captured console errors/warnings on the authenticated Admin page**.

No operational controls were used and no live data was changed.

At **2026-09-08 02:31:12 UTC**, Production remained **READY** on the same source:

- commit: `112cad6fac88bead5f2e7444c9ee583a1c1032f0`;
- tree: `8c1a9746605e50b31dc7b0c6422ef7c5eb063745`;
- deployment: `dpl_56ByS2SAVnXGD3SAbHyhhYv3YHap`;
- live `www.ironcladtournaments.com` alias confirmed.

For **02:00:33–02:30:33 UTC**, both Production-wide and deployment-scoped queries contained **no error/fatal rows and no HTTP 5xx rows**. This is only the inspected 30-minute window. The project's one-hour runtime-log retention prevents longer health claims; Clerk-hosted browser errors are outside IronClad's Vercel server logs.

**No redirect loop, authentication outage, protected-route exposure or security bypass has been demonstrated.**

## Comparisons and historical accuracy

- Production's hosted document has a TanStack inline-CSS marker, `/assets/index-B4SHO8Ja.js`, and TanStack Start Sentry metadata. Staging serves a different Next Pages renderer with build `3ToaORUPZKl7uGMAai8zX`.
- Eight fresh Staging cases covered JavaScript off/on, desktop/mobile, English/Italian browser locale, light/dark preferences and delayed scripts. No #418/#423 occurred. Its empty SSR form container populated normally after hydration.
- On September 7 at 05:52:55 UTC, Production and Staging served **byte-identical Clerk JS 6.31.0 and Clerk UI 1.32.1 entry files**. This does not establish identical portal application/React bundles or all transitive chunks.
- Inspected IronClad versions: Next 16.3.3, React/DOM 19.2.4, `@clerk/nextjs` 7.3.7; declared peer ranges were compatible. Production and Staging use separate Clerk instances; sampled DNS/TLS checks were healthy.
- Direct hosted navigation reproduces the error, so a protected-route redirect is not a necessary trigger.
- **PR #120 did not modify the relevant authentication/dependency integration. There is no evidence linking PR #120 to this issue.**
- **Onset is unknown.** Reproduction through a preceding IronClad deployment does not prove the problem predates PR #120: older deployments still reach the current separately hosted Clerk portal. Earliest preserved evidence is the September 7 release-verification window, not a known onset date.

## Unresolved cause and observed clue

`https://vercel.live/_next-live/feedback/feedback.js` appeared with two resource-source records in hosted asset inventories, but no corresponding element remained in recovered DOM. Its **initiator, insertion timing and causal role are NOT proven**. This does not prove two injections or that React removed it.

Do not state that Clerk, Vercel, ChatGPT, an extension, or `feedback.js` caused the mismatch without evidence.

Remaining hypotheses include hosted-document SSR/client structure disagreement, pre-hydration script/environment interference, and Production-specific session/configuration state. None is a proven cause.

The exact first mismatched node, successful initial document response, pre-hydration DOM, and script initiator were not captured. Available connected-browser tools exposed recovered DOM/logs/assets, not the required Network/Debugger data. Earlier disposable Chromium/Chrome/Edge tests reached Cloudflare challenges, whose HTML was not portal SSR. No bypass was attempted.

## Production safety and fix threshold

Production, authentication configuration, dependencies, database/schema/RLS, PR #120 and live operational data remained unchanged throughout the investigation. No warnings were suppressed, no speculative fix was implemented, and no release/rollback was performed.

Do not deploy a workaround or upgrade merely to make the console clean. Require a concrete causal finding or a documented applicable provider remedy, a narrowly justified change, normal review and proportionate validation. An embedded-routing mitigation would not repair the directly hosted page.

## Escalation conditions

**P1 only with credible real-user evidence** of legitimate users unable to sign in, repeated authentication failures, redirect loops, meaningful unexpected session loss, or inaccessible legitimate authenticated features.

**P0 only for** widespread authentication outage, authentication/security bypass, protected/private-data exposure, or catastrophic Production authentication failure.

**Remain P2** while hydration recovery continues, the form renders, authentication works normally and no material user impact is demonstrated.

## Future investigation checklist

- Establish current Production SHA/deployment, affected host, browser/profile and timestamps before changing anything.
- Use the least data necessary. Inspect response/DOM evidence only through authorized tooling and retain or share minimal structural metadata and redacted excerpts. Never publish raw response bodies, complete DOM dumps, serialized authentication state, account identifiers or identity-bearing screenshots to GitHub.
- Preserve the current page/console first. Compare hosted and embedded documents; do not mistake one for the other.
- Capture the successful portal response and initial parsed DOM with explicitly authorized supported developer tools. Never substitute Cloudflare challenge HTML.
- Capture the first actual SSR/client mismatch and `feedback.js` initiator/timing. Distinguish final recovered DOM from pre-hydration evidence.
- Compare uninstrumented manual Chrome evidence, controlled fresh profiles/extensions, direct versus protected-route entry, cache/timing and current hosted assets.
- Reassess real user impact and cross-host session behavior using metadata only. Do not collect passwords, cookie values, JWTs, tokens or raw authenticated HARs.
- Review current official Clerk guidance and obtain authorized read-only Dashboard/provider evidence for session settings/renderer rollout if needed.
- Verify any eventual justified candidate in Preview through normal governance. Do not reuse PR #120's one-time bypass.

## Detailed technical baseline

### Source/deployment identities at investigation time

| Environment | Commit | Tree | Deployment |
| --- | --- | --- | --- |
| Current Production / master | `112cad6fac88bead5f2e7444c9ee583a1c1032f0` | `8c1a9746605e50b31dc7b0c6422ef7c5eb063745` | `dpl_56ByS2SAVnXGD3SAbHyhhYv3YHap` |
| Immediately preceding Production | `d4df0afb969fcb30bc6158d75f2c1378e8eea3d8` | `2ab20d064c50246d5c7aef046d8472cd311a50b4` | `dpl_59cWcwhVBJHRx5W43nw1XQUp88EF` |
| Staging | `631e5ad225fdd8e702e99a3e80e57e2f62368051` | `18b21da71ebb1d383a3ff649e4829e9bc624ac83` | `dpl_4Q71JC259ST8k4mB1XEfxfvNUwZY` |

Current Production was created September 7 at 04:21:30 UTC; the preceding deployment September 6 at 14:07:37 UTC. These app deployment dates do **not** date the independently hosted portal behavior.

Exact IronClad lockfile versions inspected: Next 16.3.3; React/DOM 19.2.4; `@clerk/nextjs` 7.3.7; `@clerk/react` 6.6.6; backend 3.4.11; shared 4.29.2; localizations 4.15.4. Vercel's configured runtime was Node 24. No package update was undertaken.

### Integration audit — source observations

- `app/layout.tsx` wraps the document in `ClerkProvider` with server-selected localization. Inspected locale initialization did not use random values, a clock, browser language or a window-dependent initial branch.
- `proxy.ts` uses `clerkMiddleware` and `auth.protect()`. No custom force redirect, satellite mode or frontend-API proxy was found.
- Local optional catch-all routes embed `<SignIn />` and `<SignUp />`. Navbar links use local sign-in, while the observed embedded form's cross-link and protected-route default lead to the hosted portal. This routing inconsistency is not proof of the mismatch's cause.
- Admin pages independently check session identity and `sessionClaims.metadata.role === "admin"`; player routes independently require identity. Visibility of navigation is not the only authorization boundary.
- The relevant auth/provider/proxy/localization files and package manifest/lockfile were unchanged across the compared Production releases. Do not replace this evidence with a broad claim that PR #120 changed nothing anywhere.
- No live secret values were needed in this durable record. No database queries or migrations were needed to investigate rendering.

### Hosted renderers and assets

Production recovered structure:

```text
html: data-theme="dark", no lang attribute
head: data-tsr-inline-css marker
body:
  STYLE
  SCRIPT
  DIV.pageContainer
  DIV#clerk-components
```

Its assets included:

- `index-B4SHO8Ja.js`;
- `sign-in_._-Bn_gyGcz.js`;
- `clerk-compat-6RQDhZ3A.js`;
- `use-has-hydrated-CkUY-zQ5.js`;
- `use-hosted-native-auth-entry-BF4FSnh-.js`;
- UI chunks marked `13e6c8_1.32.1`;
- resource metadata identifying `sentry.javascript.tanstackstart-react/10.55.0`.

These markers strongly support a TanStack-based Production portal. They do not establish the exact hosted React version or hydration target. Dark theme or absent `lang` alone does not establish a defect. No `#__next` was observed, but its absence alone is not sufficient to distinguish a TanStack document from IronClad's Next App Router document.

Staging hosted URL: `https://guided-goshawk-34.accounts.dev/sign-in`. It used a different Next Pages renderer:

- build `3ToaORUPZKl7uGMAai8zX`;
- framework `framework-155d793edb9d37ef.js`;
- main `main-8646d9c4bbdec573.js`;
- account app `pages/_app-38740907eda0f09f.js`;
- route `pages/sign-in/[[...index]]-b483c69d06aacac7.js`.

Staging's parsed JavaScript-disabled root was:

```text
DIV#__next
  STYLE
  SCRIPT
  LINK
  DIV.pageContainer
    DIV.componentContainer (empty)
```

Six JavaScript-enabled cases retained that root sequence and mounted one form/two inputs without captured hydration errors or a root-replacement observation. First form appearance was 1,504–1,590 ms normally and 2,454 ms with a one-second static-script delay. Browser locale variants still rendered English UI. Expected development-key/CSS warnings and a CSP fallback console note were distinct from #418/#423. Two JavaScript-disabled cases recorded a blocked UI preload; enabled cases did not.

The common runtime entry comparison at September 7 05:52:55 UTC:

| Public runtime entry, both FAPI hosts | Redirect resolution | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Clerk JS `@6` | 307 → `6.31.0` → 200 | 308,780 | `31fbc5076df669069f749eaa15b3db45406e05c091fbe450400e47ba0a6272ca` |
| Clerk UI `@1` | 307 → `1.32.1` → 200 | 142,787 | `6875b75342959c40dc4e05617ec6fb8fef932fd41ae7c6b7d22412304f397fdc` |

The unversioned redirects were no-store; versioned scripts were public/immutable for one year with matching ETags. No Age/Last-Modified was returned. Only these two entry files were hash-compared; the portal's index/React runtime and every transitive chunk were not.

### Public environment, DNS and session evidence

At September 7 05:46:53 UTC, unauthenticated `/v1/environment` returned 200/no-store from Production `clerk.ironcladtournaments.com` and Staging `guided-goshawk-34.clerk.accounts.dev`.

Production reported a Production instance and branded hosted URLs; home/post-sign-in/up/session-switch destinations used `https://www.ironcladtournaments.com/`. Staging reported a development instance and its portal's `/default-redirect`. Both used single-session mode and password as preferred strategy. Production had development cookieless/URL-session-sync modes off; Staging had them on and test mode enabled. Production additionally included Google One Tap among first factors. Maintenance and partitioned-cookie settings were off in the sampled public configuration. These are differences, not proven misconfiguration.

Production's public post-single-sign-out destination was `/sign-in/choose`; post-all-sign-out was `/sign-in`. The chooser shell reproduced the hydration signature without selecting an account. Its presence alone did not prove a remembered identity or valid session.

DNS targets matched Clerk services for account/FAPI hosts and Vercel for `www`. Strict TLS checks passed with host-matching certificates valid through October 26, 2026. Dashboard-only allowed-origin, maximum-session/inactivity settings and renderer rollout history were not obtained.

Fresh automated Production browsers reached only a Cloudflare `__cf_bm` cookie, Secure/HttpOnly/SameSite=None, approximately 30-minute lifetime, scoped to the account host. That is not a Clerk session-persistence measurement. Healthy Staging used development-browser JWT cookies and different development transport. Only names/scope/flags/expiry metadata were inspected; no values are retained here.

A remembered sign-in method/account can coexist with an ended session, and session-token expiry differs from underlying session lifetime. Do not diagnose the Owner's normal remembered-account behavior as broken.

### Browser evidence and limitations

- September 7: in-app direct hosted reproductions at approximately 04:46:19, 04:49:33, 04:51:31 and 05:51:16 UTC; chooser reproduction at 05:52:04.
- September 8: ordinary Chrome hosted reproduction at 02:19:05 UTC; another captured known-signature set timestamped 02:27:54. No cause was assigned to the later navigation.
- Fresh Chromium 149, Chrome 152 and Edge 152 JavaScript-disabled/enabled tests hit hosted Cloudflare challenges. Earlier headed Chromium was also challenged. They were not successful portal hydration tests.
- Signed-out `/admin`, `/admin/operations`, `/profile` and dashboard probes redirected instead of serving private pages. A finite Clerk handshake returned via the protected URL before the challenge; apex dashboard also canonicalized to `www`. Intended same-origin return targets were retained in sampled probes. This is not a complete open-redirect/security audit.
- Embedded homepage/sign-in/sign-up desktop/mobile checks rendered normally, without captured page errors or horizontal overflow.
- The Owner's attached existing embedded tab was preserved before opening a separate hosted tab in the same profile. That separate tab was not a fresh cookie/extension profile.
- Attaching after hydration cannot recover every initial error. Empty newly attached logs do not prove a clean original load. Recovered DOM cannot identify the original node mismatch.
- Resource inventories do not establish successful response status, exact request order, execution timing or initiator stacks.
- No raw authenticated HTML, cookie/token dumps, account identities, private operational data or HARs are required to recover this issue.

### Explanations narrowed, not overclaimed

Excluded at capture time: differing bytes in the two common Clerk entry scripts; the need for a protected-route redirect to trigger the error; an exclusively in-app-browser reproduction.

Not supported by the inspected evidence: a PR #120 auth/dependency integration change, obvious incompatible package peers, expired TLS, incorrect basic DNS targets, shared Staging/Production Clerk instance or maintenance mode.

Staging locale/theme/viewport/delay variations were healthy; this does not exclude a Production-renderer-specific timing or state interaction. Shared browser tooling, extensions, configuration/session differences and a hosted SSR structural defect remain possible. No party or script is assigned fault.

### Prior verification versus documentation verification

The earlier isolated investigation baseline passed lint, TypeScript, and 310 test files/3,042 tests. The default Turbopack build failed because the exact-lock dependency junction pointed outside that worktree's filesystem root; a supplemental Webpack build with synthetic test-only environment values passed. This is a tooling limitation, not a proven Production auth defect, and not a claim that the default build passed.

No application code changed. Do not interpret those September 7 runs as new checks on a future release. Documentation-only work requires factual/link/whitespace/privacy validation; any automatically triggered PR CI is reported separately.

## Documentation deployment safety

Before committing this document on September 8, the live Vercel settings were checked: linked GitHub repository `IronClad2026/ironclad-website`; Production branch `master`; Git deployment creation enabled; no configured ignored-build command; project root at repository root. The source had no `vercel.json` or workspace-monorepo declaration. Automatic unaffected-project skipping was not a verified documentation-only exemption.

Therefore a docs-only merge to `master` **must be treated as Production-triggering**. Hold this document in a normal documentation branch/draft PR and include it later with a legitimate reviewed release. No merge, auto-merge, Production deployment, settings workaround, CI bypass or PR #120 exception is authorized merely to publish this Markdown. A non-Production branch can generate a Preview; never promote it solely for documentation.

The GitHub issue is durable immediately and remains open independently of a future documentation merge. Use “Related to” rather than an automatic issue-closing keyword in the documentation PR. No automatic monitor, notification subscription or scheduled probe is implied by OPEN / MONITORING.

## Exact future Codex recovery instructions

When a future authentication issue occurs:

1. read the GitHub issue completely;
2. read the permanent Markdown record if available;
3. inspect current Production behaviour before changing anything;
4. compare current symptoms against the recorded #418/#423 signature;
5. determine whether user impact has changed;
6. check whether Clerk hosted assets/renderer changed;
7. review current official Clerk guidance;
8. obtain authorized Clerk Dashboard/provider evidence if necessary;
9. do not deploy a speculative fix just to remove console warnings.

Recovery phrase:

> Find and read the documented P2 Clerk hosted sign-in React #418/#423 known issue for IronClad and its linked GitHub record. Continue from the recorded evidence and do not assume a Production fix is required.

Primary references: [React hydration diagnostics](https://react.dev/reference/react-dom/client/hydrateRoot), [Clerk Account Portal](https://clerk.com/docs/guides/account-portal/overview), [Clerk session options](https://clerk.com/docs/guides/secure/session-options), [Vercel runtime-log retention](https://vercel.com/docs/logs/runtime).
