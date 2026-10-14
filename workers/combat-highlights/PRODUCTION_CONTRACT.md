# Production Highlights resource contract

VERIFIED SOURCE: Highlights defaults OFF in the application and Worker template. The template has no Cloudflare account, R2 binding, route, media origin or signing material. No Production resource has been provisioned or checked by this candidate.

UNVERIFIED: Provider configuration, private R2 access, signing-key pairing, Worker deployment, database entitlement checks, playback and deletion delivery. Synthetic unit and browser tests do not verify these providers.

After separate authorization, provision a dedicated Production Worker and private Production R2 bucket. Configure `MEDIA` only to that new bucket. Never reuse another environment's Worker, bucket or signing keys. Worker environment keys are `DEPLOYMENT_ENV`, `ENABLED`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SIGNING_PUBLIC_JWK`, `MEDIA_ORIGIN`, and `ALLOWED_ORIGINS`. The Worker accepts a canonical Production Supabase origin and checks its configured media origin against each request. Only the two public Production application origins are allowed.

Application keys are `COMBAT_HIGHLIGHTS_ENABLED`, `COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV`, `COMBAT_HIGHLIGHTS_WORKER_URL`, `COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS`, and `COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK`. Enablement requires `VERCEL_ENV=production`, the Production Supabase origin, a private P-256 signing key, and a dedicated Production media origin. Allowed planned media hostnames are `media.ironcladtournaments.com`, `highlights.ironcladtournaments.com`, or a Worker hostname beginning `ironclad-production-combat-highlights`. These names describe the future contract; they do not establish deployed resources. The SQL feature switch must also remain OFF until the entire contract is provisioned and verified.

Set both enablement keys and the database feature switch OFF to disable the feature. Existing metadata must be retained, and cleanup must resume only against the verified Production bucket. Closure cleanup is asynchronous; account closure must remove database visibility immediately even when object deletion is unavailable.

The `local` resource path permits only unhosted loopback synthetic validation. Hosted previews and production-mode Node cannot use that path. Hosted release Preview builds are blocked by `next.config.ts` before application evaluation until independent resource isolation is established in a separately reviewed change.
