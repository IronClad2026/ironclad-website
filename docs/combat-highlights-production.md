# Combat Highlights Production operations

This feature uses dedicated resources in the existing IronClad Cloudflare account.
It does not share Staging media, signing keys, identities or provider settings.

- Supabase: `nsyjtqpvyxlzyujlbzos`.
- Worker: `ironclad-production-combat-highlights`.
- Media origin: `https://ironclad-production-combat-highlights.ironclad-website.workers.dev`.
- Private Standard R2 bucket: `ironclad-production-combat-highlights`, binding `MEDIA`.
- Website origins: `https://ironcladtournaments.com`, `https://www.ironcladtournaments.com`.

The Workers hostname avoids unrelated website DNS changes. R2 public access and
bucket custom domains must remain disabled; the Worker performs fresh database
authorization before public or owner playback. Worker preview URLs remain disabled.

## Configuration and activation

Keep `COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK` as a sensitive Production-only Vercel
secret. It must never be public, logged, committed or installed on the Worker.
The Worker receives only `SIGNING_PUBLIC_JWK` and the Production publishable key.
Use a dedicated P-256 key pair, and verify signing/verification before activation.
The application checks Production deployment, database origin, media origin,
allowed origins and signing material. Missing/mismatched configuration fails closed.

The committed Wrangler configuration deliberately defaults `ENABLED=false`.
After provider validation, the authorized activation command is:

```sh
wrangler deploy --config workers/combat-highlights/wrangler.jsonc --var ENABLED:true
```

Provision and verify the private bucket and Worker first. Install the four scoped
application configuration values and dedicated private signing secret, keeping
`COMBAT_HIGHLIGHTS_ENABLED=false`. Provider checks use only disposable private
objects without creating players or competition records. Then deploy the reviewed
application with `COMBAT_HIGHLIGHTS_ENABLED=true`, verify the effective Production
deployment and transport, and activate only `player_combat_highlights.enabled`.
Full authenticated end-to-end verification requires the three enablement layers;
it cannot run while the database/application gates are off. Use the authorized
administrator's own account, remove test clips through supported owner actions,
and disable immediately if a required security/functional check fails.

Do not reapply the deployed authority migration or synchronize Staging data.
No competition, season, ranking, badge, prize or historical records are changed.

## Cleanup

Vercel Cron invokes `/api/cron/combat-highlights-cleanup` every five minutes using
the sensitive Production `CRON_SECRET`. This exact route authenticates its own
bearer credential; other cron paths remain Clerk-protected. HEAD never drains.
Requests return only a count, with no-store headers and no object/player identifiers.
The route processes at most ten existing SQL cleanup claims within a 60-second
execution limit. Each provider deletion has a five-second deadline. Claims, leases,
expiry grace, retry backoff and idempotent deletion retain the existing SQL authority.
The schedule neither invokes email/notification workers nor adds a paid scheduler.

Visibility disappears immediately on owner deletion, moderation hide, privacy
restriction or account closure. Physical object deletion can follow asynchronously
after reservation expiry/grace and retry. Never force those deadlines or remove
historical/audit records to make a cleanup test pass. The authenticated admin retry
remains available, and the scheduled drain also runs when no further owner request
arrives. A disabled/unconfigured application makes the drain idle.

## Emergency disable and recovery

1. Immediately switch only `player_combat_highlights.enabled` to false through
   the authorized Production administration connection. New reservations and public
   entitlement fail closed. This preserves metadata and objects. Owner reads are
   intentionally retained by SQL, so this is not a complete transport shutdown.
2. Set only Production `COMBAT_HIGHLIGHTS_ENABLED=false` and redeploy the intended
   Production application. Old deployments retain their previous environment values.
3. Disable Worker transport with the committed defaults:

```sh
wrangler deploy --config workers/combat-highlights/wrangler.jsonc
```

Confirm `/health` returns 503, app media configuration is unavailable, the database
switch is false, and anonymous/owner/upload requests cannot reach media. Preserve
all metadata and legitimate clips. Full transport disable pauses provider cleanup;
recovery reinstalls the same verified private transport and resumes durable claims.
When only public/new-upload availability must stop, the database switch can stay
off while verified application/Worker transport continues bounded cleanup.

## Privacy and verification

The localized pre-upload notice identifies Cloudflare processing, selected public
visibility and asynchronous deletion, and links its provider privacy policy. It
clarifies the existing optional profile-media operation without replacing the
immutable Privacy/Terms/PPA/Rulebook artifacts or changing their acceptance gate.
The existing declaration still requires genuine CoH3 gameplay involving the uploader
and rights to share. Synthetic files used for isolated provider/browser validation
must never be represented as a real player's gameplay or accepted under that declaration.

Review Cloudflare's customer DPA, subprocessor list and R2 encryption documentation
for the relevant processing; do not claim an independently certified data region.
No raw signing keys, JWTs, credentials, user clips or private object paths belong in
execution receipts, logs or source control. Retain aggregate history fingerprints,
configuration names/scoping, public signing-key fingerprint, deployment/version
identities, test outcomes and temporary-object cleanup evidence outside secrets.

The activation receipt must record provider security tests, authenticated upload,
validation, owner/public playback and range seeking, moderation/report behavior,
replacement/reorder/remove, durable cleanup, privacy contracts, desktop/mobile
checks and all applicable CI results. An unavailable authenticated proof is not PASS.

Normal metered Workers/R2 usage is under the existing account. No paid plan, add-on,
new storage subscription or new scheduler is provisioned by this procedure.
