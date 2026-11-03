# Patch 2 Phase 4 — CANCELLED

The user cancelled built-in player-chat translation on 3 November 2026. This
file records the removal and retained Staging schema; it is not an activation
runbook. Do not configure Cloudflare, run provider tests or include Phase 4 in
the Production release package.

## Selective Staging cleanup

Cleanup branch: `feature/patch2-remove-chat-translation-staging`, based on
`726c6b1c4ac4434e3846845ddf8043c4a532a742`. The published Phase 4 commits were
`80aae7b` and `726c6b1`. The later local-only `3e8e796` and the other session's
alternative implementation were not incorporated.

The application, shared libraries, package manifests, environment example and
ordinary MatchRoom source return exactly to Phase 3 evidence commit `e4af0fa`.
Only Phase 4 controls, translation endpoint/actions, provider/detection code,
translation tests, dependencies and the translation fixture factory are removed.
No branch reset, whole-Staging rollback or existing record deletion is involved.
The small browser-test repairs for existing chat visibility and retired legacy
assistance controls are retained. The assistance test repairs change no user flow.

## Configuration checked and cleaned

Fresh branch-specific Vercel inspection verified both settings below were false,
scoped only to Preview and `staging`, and not shared/Production settings. Both
unused settings were then removed with explicit `preview staging` CLI scope:

- `PATCH2_CHAT_TRANSLATION_ENABLED`
- `CLOUDFLARE_WORKERS_AI_FREE_ONLY_VERIFIED`

Readback confirmed neither remains. No Cloudflare account ID or API-token
binding was configured. No provider requests were made. The database setting
`match_chat_translation_enabled` remains false. No Clerk, Supabase, partner,
Production, email or push binding was changed by this cleanup.

## Applied migration deliberately retained on Staging

`supabase/migrations/20261103024129_patch2_match_chat_translation.sql` remains
byte-identical, SHA-256
`53b067a4fa10ca7280a536264be87430387497755fc31cb98bd99b485ba55c69`.
Staging receipt: `20261103030927`, name `patch2_match_chat_translation`.

It added three private, RLS-protected translation cache/usage/daily tables,
limited RPCs, a default-off setting and source-change invalidation trigger.
Fresh read-only Staging SQL found all three tables empty and the setting false.
The server route and calling application code are removed. The migration does
not replace normal message sending, match reporting, registration, assistance,
deadlines or Storage functions and does not restore push execution permission.

Do not drop these objects or rewrite migration history just to remove the UI.
The migration and its local schema diagnostic harness remain only in the
Staging history. They are excluded from `release/patch2-phases1-3-review`.
There is no new cleanup migration and none was applied remotely for cancellation.

## Preserved synthetic history and delivery controls

The translation acceptance tournament remains present:
`bada51e8-3773-489b-ad17-974e6dab2ccb`, slug
`patch4-staging-chat-20261103-v1`. Its registrations, normal chat, match and
history remain intact. It was not cancelled: automatic approval review rejected
the terminal fixture action before execution, and the user's feature-cancellation
reply did not explicitly approve cancelling this tournament. Do not reroute that
same blocked action through SQL, REST or another agent.

The 17 existing owned notification events were already suppressed and retained.
Fresh SQL found zero delivery-eligible or actively claimed owned events. Email
mode remains disabled. The temporary push block remains the service-role execute
revocation on Staging's claim function; its ACL is postgres-only and no claimed
processing events remain. Neither Patch 2 migration nor this removal restores it.

The independent email worker, auto-approval, waitlist-offer expiry and matchup
deadline cron jobs continue despite push WORKER_FAILED. Four future deadlines
in this synthetic tournament remain active around 10 November. Before any later
push/email restoration, explicitly retire this owned fixture and suppress any
subsequently generated owned events. Do not clear unrelated queues or delete
subscriptions. No restoration is authorized by this cleanup.

## Release requirements

Translation/provider quality and account access are no longer Patch 2 release
gates. Actual replay bytes upload/download/access restriction acceptance, a
second distinct admin login, physical-phone testing, manual review and explicit
Production approval remain open. See `docs/patch2-phases1-3-staging-review.md`
for the feature evidence, links and final cleanup validation.
