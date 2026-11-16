# Ready knowledge sources

Ready retrieves short reviewed summaries for IronClad questions. Each summary identifies the governing section. These summaries and the public FAQ are guidance. Applicable mandatory law comes first. The Rulebook, Participation Agreement, Terms and Privacy Policy each control their stated scope. Published event materials apply only within the scope those documents permit. [IronClad rules hub](https://www.ironcladtournaments.com/rules)

## Approved corpus

| Source | Publication and status | Scope |
| --- | --- | --- |
| [Official Tournament Rulebook v3.2](https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.2.pdf) | Effective 29 September 2026, current published version | Competition mechanics and administration |
| [Player Participation Agreement v3.2](https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-player-participation-agreement-v3.2.pdf) | Effective 29 September 2026, current published version | Participation, conduct and conditional prizes |
| [Terms of Service v1.1](https://www.ironcladtournaments.com/terms) | Effective 20 August 2026, current published version | Platform use |
| [Privacy Policy v1.3](https://www.ironcladtournaments.com/privacy) | Effective 23 September 2026, current on the published rules hub | Treatment of personal information |
| Rulebook and Participation Agreement v3.0 and v3.1, Terms v1.0, Privacy v1.0 through v1.2 | Approved immutable copies in the repository's existing delivery manifest. Resolve the actual version from the event acceptance. | Existing and historical registrations |
| Tournament Page, published map pool, Published Decisions and Event Prize Terms | Applicable to the named event and division when published there | Event dates, settings, pools, decisions and conditional prizes |

Staging's content and legal delivery manifest at the integration baseline include Privacy v1.2, while the public rules hub shows Privacy v1.3. General published-policy guidance links to the public policy. An event-specific answer uses the exact document version from the authorised registration acceptance. If a version or its authenticity cannot be confirmed, Ready directs the player to admin help. Historical PDFs are served from the checked-in immutable paths, using the same byte-verified copies supplied by registration. Proposed Rulebook v3.3, Terms v1.2 and proposed public-profile wording are outside the approved catalogue.

## Capability map for document questions

| Question | Authority and workflow |
| --- | --- |
| Registration, age, Steam, Relic, division, waitlist, withdrawal | Rulebook §§ 4–5 and 21, PPA §§ 3–5, `/tournaments` and its existing registration flow |
| Series format, finals and lobby rules | Rulebook §§ 3 and 8, applicable Event settings on the Tournament Page |
| Map pools, side selection and Dice | Rulebook §§ 6–7, published map pool and participant-initiated Dice in the current platform |
| Contact expectations, delays and deadline exceptions | Rulebook § 9. The live Match page has the actual deadline. Admin Assistance handles unresolved scheduling |
| Pauses, disconnects, replay proof, report submission, disputes and no-shows | Rulebook §§ 10–12, existing Match result and evidence workflows |
| Published Decisions and event prizes | Rulebook §§ 6 and 20, PPA § 13, the existing `decisions` tab and `prizes` overview panel on `/tournaments` |
| Discord and admin help | Rulebook §§ 4 and 9, match-scoped Admin Assistance and the [operator-confirmed ticket channel](https://discord.com/channels/1440092095619662105/1440201093110960137). Members click the ticket-creation control in that channel. Players who have yet to join use the [separate server invitation](https://discord.gg/ZQSQjBNRm3) |
| Governing versions, terms and privacy | Rulebook § 21, PPA §§ 19–20, Terms §§ 2, 4 and 22, Privacy §§ 11, 13 and 25. The private Registration Acceptance Record supplies the approved version for the player's own event |

The exact Discord destination comes from `lib/support.ts` and operator confirmation recorded in `docs/patch2-phase3-staging.md`. The channel requires Discord membership to inspect. Opening the link is navigation. The ticket begins when the player uses the Discord panel.

## Refresh and review

1. Follow the published rules hub to the new version and confirm approval, effective date, scope, stable link and immutable hash in the trusted register and delivery manifest.
2. Compare changed sections and refresh their paraphrases and references in `lib/ready/knowledge.ts`. Update `lib/ready/knowledge-sources.ts` for the public current version. Keep enabled historical versions linked to their immutable artifacts.
3. Verify any event change in the existing public tournament, prize, pool or Decisions projection. Questions about a specific discrepancy should go to an admin with the applicable links.
4. Bump `READY_KNOWLEDGE_REVISION` so cached public resolutions using obsolete passages stop matching. Keep private or event-personal decisions out of shared caches.
5. Run `npx vitest run tests/unit/ready-knowledge.test.ts`, then verify the answer and citation in the protected browser journey. The focused tests cover current and historical division guidance, version ambiguity, citation targets, private proof and regulated outcomes, without treating generated text as a governing source.
