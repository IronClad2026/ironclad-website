# Patch 2 Phases 1–3 — Staging review after translation cancellation

Prepared 3 November 2026. Production has not been changed. This report separates
fresh cleanup checks from earlier acceptance that remains valid because all
application source is exactly the accepted Phase 3 `e4af0fa` source.

## Current deployment and safe scope

Staging: https://ironclad-website-git-staging-ironclad-tournaments.vercel.app

Before cancellation, the READY deployment was `726c6b1c4ac4434e3846845ddf8043c4a532a742`
(`dpl_36YXa2mXaT1ANZLRpwmiL6Dp9RSB`). The selective cleanup is committed on
`feature/patch2-remove-chat-translation-staging` and released only by a normal
fast-forward update to `staging`. The final deployment SHA/URL and fresh hosted
chat checks are recorded in the completion handoff and local acceptance artifact.
No reset, force push, entire-Staging merge or Production action is authorized.

Fresh Staging-only evidence: Supabase `zzbnneprhjicmajpjkdg`, private
`match-proofs`, ordinary Match Room enabled, private-assistance new requests
enabled, `PATCH2_ADMIN_INBOX_ENABLED` enabled. Translation database flag is false;
its three private tables are empty. Both unused false Preview/staging translation
keys were removed and readback confirmed absence. Other configured connections
were preserved. No Cloudflare request or new identity configuration was needed.

Email remains `TRANSACTIONAL_EMAIL_MODE=disabled`. Push claim execute remains
postgres-only, body SHA unchanged, and no active push claims exist. Owned
synthetic pending/retryable delivery events are suppressed, not deleted. Actual
push delivery is intentionally untested. Independent email/badge work, result
auto-approval, waitlist expiry and matchup deadlines still run despite the shared
worker's push-related WORKER_FAILED; that error does not stop competition jobs.

## Applied Patch 2 migrations on Staging

The ledger uses execution-time receipt versions. Match source names as well as
receipt versions; do not replay or reconcile unrelated history.

| Source migration | Receipt version | State |
| --- | --- | --- |
| `20261101220837_patch2_scoped_registration_review.sql` | `20261102015821` | Applied; tournament guards and preserved review rules |
| `20261101230355_patch2_admin_inbox_legacy_assistance.sql` | `20261102015841` | Applied; shared scoped inbox, dismissal, durable legacy queue |
| `20261102192200_patch2_private_assistance_conversations.sql` | `20261102194457` | Applied; private threads/replies/status/notification records |
| `20261102195256_patch2_private_assistance_active_actor.sql` | `20261102195541` | Applied; require active linked requester account |
| `20261103024129_patch2_match_chat_translation.sql` | `20261103030927` | Retained, disabled and empty; excluded from Production package |

No new cancellation migration was prepared or applied. No existing migration was
edited or dropped. None of these files was applied to Production by this task.
See `patch2-phase4-staging.md` for the harmless dormant schema and fixture timers.

## Feature evidence and limits

| Feature | Passed evidence | Failed or still unverified |
| --- | --- | --- |
| Tournament registration workspace | Earlier real admin browser: six statuses, full counts, 25+1 pagination, selection reset, notes, approve/reject/manual review, old links to actual tournament and denied foreign details. Hosted rollback SQL: capacity, ELO, FIFO, expiry, withdrawal and roster locks. Current app unchanged. | No known unresolved supported-flow defect. Physical phone review remains open. |
| Shared admin inbox | Earlier real browser: read one/selected/all across pages, soft removal, retained-tab idempotence. Hosted SQL: mixed-batch atomic rejection, tournament boundaries, guarded old/contextless callers. Records retained and other-tournament digest unchanged. | A second DISTINCT admin has not confirmed the same shared state. |
| Durable legacy assistance | Earlier browser/database: unanswered request remains Open and visible after removing its notification; historical association/status retained, unknown legacy ownership/history not invented. | No known unresolved supported-flow defect. Retired textless creation/reopen UI is intentionally unavailable. |
| Private conversations and replies | Real admin/requester browser acceptance completed 3 Nov at 02:04 UTC: both sides' persisted replies, exact requester website notification link, Open/In progress/Resolved persistence, requester reply reopening, opponents denied each other's thread, own access after inbox removal. Other tournament/competition digests unchanged. | No known unresolved supported-flow defect. Phone review and second admin remain open. |
| Discord option | User confirmed the ticket panel destination. Website link, copyable reference, staff-availability copy and instruction to click Discord's ticket button checked in real browser. | Discord panel contents are user-confirmed; not independently inspected. Opening the link never claims to create a ticket. |
| Ordinary player chat | Earlier real browser saved an original Italian scheduling message and read it back in a fresh tab. Current MatchRoom/source/send contracts exactly match pre-Phase4. Fresh local 375/390 regression checks cover sending, drafts, unread/history and assistance coexistence. | Actual replay bytes acceptance and physical-phone chat testing remain open; local transport mocks do not establish those. |

Historical failures were fixed before this handoff: scoped pagination/snapshot
races, unsafe old global inbox writers, private active-account guard and requester
notification navigation. Four newly encountered legacy unit tests expected
retired Phase 3 request/reopen buttons; test expectations were repaired without
changing the application. The dormant legacy result writer's sequential-game
limitation has no supported current website caller and was not expanded into an
unrelated repair.

## Fresh cleanup validation

Tests run through `scripts/patch2/verify-local.mjs` with no copied environment
files, stripped credentials, inert loopback identities and blocked remote network.

- Focused registration/inbox/assistance/navigation/MatchRoom checks: 295 passed
  initially and four obsolete expectations failed; repaired file passed all 7.
  The resulting 20-file selection has 299 passing tests, reusing unchanged passes.
- Local Match Room browser regression: 17 passed, including 375/390 widths,
  normal sending, draft preservation and legacy assistance. Synthetic transports,
  not real hosted replay uploads.
- Full lint, standalone strict TypeScript and network-blocked Next build passed.
  The build has no translation endpoint. Git whitespace checks passed.
- Independent actual-diff review found no blocking application issue and confirmed
  all app/components/lib/package/environment-example content equals Phase 3.
- Prior hosted acceptance is explicitly reused; a full database test suite was
  not repeated and mocked checks are not presented as real browser/database proof.

## Direct manual-review links

All links use the existing Staging site and normal Clerk sign-in. Admin pages
require an existing authorized admin account; no roles have been changed.

- [Registration A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/a5e1146d-883b-4d96-9840-fa9abd6a3120?section=registrations)
- [Registration B](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/e1e8689b-1b17-4e5e-b229-c0abca00135a?section=registrations)
- [Shared inbox A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/a5e1146d-883b-4d96-9840-fa9abd6a3120?section=notifications)
- [Shared inbox B](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/e1e8689b-1b17-4e5e-b229-c0abca00135a?section=notifications)
- [Legacy assistance A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/notifications/legacy-assistance?kind=tournament&tournamentId=a5e1146d-883b-4d96-9840-fa9abd6a3120)
- [Private assistance admin A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/f57d9890-5ac1-4c81-a966-f7c9324c937f?section=assistance)
- [Private assistance admin B](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/87ca54d4-e6a7-4a49-b348-a4230b9a9476?section=assistance)
- [TestAcademy1 private conversation](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/assistance/86c6c249-14f3-4dc0-bcad-7b100437dc51?tournament=f57d9890-5ac1-4c81-a966-f7c9324c937f)
- [TestAcademy2 unanswered conversation](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/assistance/d5b86b25-502d-427e-ab4b-6e5c353c5e4c?tournament=f57d9890-5ac1-4c81-a966-f7c9324c937f)
- [Ordinary chat test match](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/tournaments?tournament=bada51e8-3773-489b-ad17-974e6dab2ccb&tab=brackets&match=844267ad-6b30-4a5f-b265-45d63995fbc0)
- [Confirmed Discord ticket panel](https://discord.com/channels/1440092095619662105/1440201093110960137)

Private links intentionally deny another player. Their conversation content is
not public merely because a direct link is listed.

Phone checklist (use only labelled synthetic records):

1. As admin, open Registration A, check all six statuses and counts, select a row,
   switch to B and confirm the selection clears and A records are absent.
2. In inbox A, try read-one/selected/all and removal; check B is unchanged.
   Changes apply to ALL admins. Confirm unanswered assistance remains in its queue.
3. Reply to a synthetic private request, change status and reload. As its test
   requester, follow the website notification to the same thread and reply.
4. Confirm the opponent cannot open that private thread. Check Discord opens the
   confirmed panel and copy a reference; press its ticket button yourself if needed.
5. As a test participant, use ordinary match chat and check mobile controls and
   drafts. There should be no translation controls. Report any problem before release.

## Production status: BLOCKED for release; ready for manual Staging review

Open requirements: actual replay upload/persisted-byte retrieval/access denial
with a permitted method and fresh fixture; second distinct admin; physical phone
and user manual review. The previous replay browser restriction requires the
ChatGPT extension's Allow access to file URLs setting on the working PC, or a
permitted supported alternative. It cannot be enabled from phone Chrome; the
blocked method has not been retried or counted as passed.

The separately reviewable LOCAL branch `release/patch2-phases1-3-review` preserves
`688759c`/`b86cb0d`, contains exactly the four intended migrations and no Phase 4
schema/source/dependencies. Its own report records exact commit/hash provenance
and independent checks. No release branch push, merge, Production migration or
configuration change occurred. Before any Production action, refresh actual
Production schema/dependencies read-only, finish the gates above and obtain the
user's explicit release decision. Never merge the entire Staging branch.
