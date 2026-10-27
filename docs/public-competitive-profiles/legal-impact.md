# Public competitive profiles — legal review draft

Status: **DRAFT ONLY — NOT PUBLISHED OR EFFECTIVE**. Prepared 28 October 2026
against master `56668b5e6613fd15f5a230e0a0d882149ca199d5`.

This file is a proposed wording and release assessment. It is not imported by
the application. No published corpus, immutable PDF, delivery manifest, legal
document registry, acceptance evidence, account legal gate or registration
control is changed by it. HOLD THE LINE remains on its existing documents and
acceptance rules. Marco must separately approve legal publication and the
Production transition.

## Documents and proposed successor versions

| Current source | Proposed future version | Required adjustment |
| --- | --- | --- |
| Rulebook 3.2 §19.2–19.3 | 3.3 | Remove the express optional competitive-profile promise. |
| Player Participation Agreement 3.2 §14.3, §20.2 | 3.3 | Explain public competitive identity and preserve separate optional permissions. |
| Terms 1.1 §8, §12 | 1.2 | Describe the participation model and narrow visibility-setting language to optional content. |
| Privacy Policy 1.3 §3, §5, §6, §8, §9, §14, §15, §20 | 1.4 | Disclose public fields, canonical Relic correlation, recipients, closure protections and remaining choices. |

The Rulebook also requires a successor: it expressly states that public player
profiles are opt-in. Preserve all previous versions, immutable artifacts and
acceptance receipts. Assign an effective date only through a separately approved
publication, after validating the then-current effective versions.

## Exact proposed wording

These replacements preserve unrelated paragraphs and controls. They do not
introduce a public SteamID64, raw verification payload, proof path, signed URL,
account-management information or unsupported statistic.

### Rulebook

Replace §19.2 with:

> Every active IronClad Player has a public competitive profile as part of participating in IronClad. Supported competitive information may include the Player's in-game or display name, public avatar presentation, country and competitive region, current verified rating and Division, Tournament participation, official results, rankings, Career History, achievements and badges. Public competitive identity is separate from private Account management.

Replace §19.3 with:

> Discord contact visibility remains optional and is controlled separately. Email, authentication information, acceptance records, private operational information and private evidence are not public competitive-profile fields. The Privacy Policy explains supported integrations, public information and account-closure protections.

Keep §19.4–19.7, including private evidence and Former Competitor protections.

### Player Participation Agreement

Replace §14.3 with:

> Every active Player has a public IronClad competitive profile. Supported competitive identity, verified rating, Tournament participation, official results, standings, Career History, achievements and badges may be displayed publicly and supplied through supported competition integrations. A verified canonical Relic profile ID and public IronClad profile link may be used to connect that competitive identity across platforms. Optional Discord contact visibility is separate. Account closure preserves the Privacy Policy's suppression and pseudonymisation protections for retained Competition History.

Replace §20.2 with:

> Privacy acknowledgement confirms that the Player was presented with the identified Privacy Policy. It is not blanket consent for optional public Discord, promotional media or other processing that requires a separate choice or lawful basis. The public competitive-profile model is described in the Governing Documents; it is not an optional profile-publication setting.

Keep the six registration controls in §20.1 and the immutable acceptance rules
in §20.3–20.7 unchanged. Do not rewrite any existing Registration Acceptance
Record or treat an old acknowledgement as acceptance of an unpublished version.

### Terms

In §8, retain profile accuracy, optional Discord and notification paragraphs.
Replace its final public-profile-visibility paragraph with:

> Every active IronClad Player has a public competitive profile. The public profile may display supported competitive identity, public avatar presentation, country and competitive region, current verified rating and Division, Tournament participation, official results, rankings, Career History, achievements and badges. Supported competition integrations may receive the verified canonical Relic profile ID and public IronClad profile link. Private Account management remains separate. Discord is displayed only when the Player enables its separate public-visibility setting. Closing an Account does not automatically remove factual Competition History; retained history may identify the person as Former Competitor where permitted and necessary, without reconnecting it to the closed public profile or Relic identity.

In §12's operational-licence list, replace `honor selected visibility settings;`
with:

> honor selected settings for optional contact and other optional content;

### Privacy Policy

In §3's profile-data list, replace `profile visibility settings;` with:

> competitive profile information and separate settings for optional public contact or other optional content;

In §3's Steam and Relic list, add:

> verified canonical Relic profile ID;

In §5, replace `create and maintain profiles;` with:

> create and maintain public competitive profiles and private Account management;

Also replace `publish factual Competition History;` with:

> publish supported competitive identity and factual Competition History, and connect verified competitive identity through supported competition integrations;

Replace §6's paragraph beginning `Public-profile visibility, public Discord`
with:

> An active Player's competitive profile is public as part of the IronClad participation model. This does not make private Account information public. Optional public Discord and promotional media remain separate choices. Withdrawing an optional choice does not invalidate processing that was already lawful and does not automatically erase factual Competition History. Applicable legal grounds, necessity and privacy rights continue to govern each use and disclosure.

Replace §8's first paragraph with:

> Profile data supports eligibility, competitive identification and public competitive presentation. Every active Player has a public competitive profile. The Dashboard remains private Account management.

Retain §8's avatar paragraph, which explains that private avatar objects are
mediated through a player-ID route. Replace its Discord paragraph with:

> Discord is optional. A blank value is stored as absent and does not prevent profile completion or registration. Discord is shown publicly only when the Player enables its separate Discord-publication setting. Clearing Discord disables its public visibility.

Replace §8's final public-profile-opt-out paragraph with:

> Competitive profile visibility is not an optional setting for active Players. Account closure and applicable privacy rights remain available under this Policy.

In §9, after the current-verification paragraph, add:

> When trusted verification establishes a canonical Relic profile ID, IronClad stores that binding. An active Player's verified canonical Relic profile ID may be supplied with their public IronClad profile link through supported competition integrations, including CoH3Stats, to connect public competitive identity and history. An account without a verified binding is not assigned a guessed identity. SteamID64 and raw verification responses are not included in this public integration.

Retain `Active verification does not use COH3Stats.` Verification remains a
Steam/Relic operation; the new API is an outward competitive-data integration.

Replace §14's first paragraph with:

> Every active Player has a public competitive profile. Supported public information may include in-game and display name, public avatar presentation, country and competitive region, current verified ELO and Division, Tournament participation, match and Tournament history, official results, supported wins, losses, placements and championships, rankings, achievements and badges, verified canonical Relic profile ID where required for supported competition integration, and the public IronClad profile link. Public Discord is included only when separately enabled. Public Event information may also include registration and bracket facts, scores, standings, champion records, final Published Decisions and explicitly enabled anonymous Poll totals. Only information supported by IronClad's authoritative records is displayed.

After that paragraph, add:

> Combat Highlights are optional player-submitted clips. Eligible clips attached to an active competitive profile are public. Clips hidden through IronClad's individual hiding or moderation controls are not publicly playable, and closed-account protections continue to apply. Public competitive-profile status does not remove these clip-level controls.

The existing upload declaration text, declaration version and submission flow
remain unchanged in this implementation.

Replace §14's second paragraph with:

> Private Account information is separate from the public competitive profile. Email, Clerk and authentication information, acceptance receipts, IP information, Admin or moderation notes, internal notifications and audit data, raw provider-verification payloads, service credentials, private replay or avatar object paths and signed private-storage URLs are not public competitive fields. Closing an Account does not automatically remove factual Competition History.

Retain §14's existing closed-account suppression and international-access
paragraphs.

In §15's providers and recipients list, add:

> CoH3Stats: authenticated, read-only access to supported public competitive information, including an active Player's verified canonical Relic profile ID and public IronClad profile link where available. CoH3Stats does not verify IronClad eligibility, receive private Account or evidence data through this integration, or change IronClad competition state.

In §20's opening rights paragraph, replace
`changes to public-profile or public-Discord settings,` with:

> changes to optional public-Discord settings,

Replace §20's paragraph beginning `Withdrawing public-profile, Discord` with:

> Withdrawing optional Discord or media permission does not automatically erase lawful historic publication or affect processing already completed on another valid basis. Public competitive-profile processing remains subject to applicable access, correction, objection, restriction, erasure and complaint rights and the lawful Competition History needs described in this Policy.

Keep retention periods, private acceptance evidence and all closure handling
unchanged.

## Signup and product wording

`app/sign-up/[[...sign-up]]/page.tsx` renders Clerk's `SignUp` component and has no
repository-authored promise about optional competitive visibility. Clerk-hosted
copy must be checked separately before a future release; this task does not
alter Clerk configuration. Proposed short notice for an approved future signup
or profile-completion presentation:

> Your IronClad competitive profile is public. It shows supported competitive identity, verified rating, participation and results. Account management remains private. Discord contact is public only if you enable it.

Dashboard opt-in/out wording is removed by the application change. Optional
Discord wording and controls remain. Do not insert a new acceptance checkbox,
gate, registration control or acceptance record in this task.

The eight `lib/i18n/dictionaries/*/help-legal-ui.ts` rule guides currently
summarize the Effective documents, including their old optional-profile rule.
Keep that legal guide text unchanged in this implementation. After separate
publication approval, replace the English `rules.sections.conduct.privacyText` value
(the property named `privacyText` in the rule summary) with this proposed text,
and update the corresponding seven translations together:

> Every active Player has a public competitive profile with supported competitive identity and history. Discord contact visibility remains optional. Private replays, Poll records, disputes and Admin-review material remain access-controlled. Account closure may pseudonymise a history-bearing account as Former Competitor while protecting the closed profile and Relic identity and preserving official brackets, results and standings.

The temporary Staging mismatch between the legal guide's old opt-in summary and
the new product behavior is a recorded release blocker, not authorization to
publish revised governing terms through a translated summary.

## Existing users, notice and HOLD THE LINE

The old documents expressly promised an opt-in. Making that information public
is a material disclosure-policy change; publishing replacement text alone does
not establish that all previous users had suitable notice or that every
disclosure has an appropriate lawful basis. Before Production, the operators
should approve the necessity, lawful-basis and reasonable-expectations assessment
and a clear advance notice/transition plan, including privacy requests and
objections where applicable. This is a recommendation for a separate release
decision, not a new runtime approval or legal gate.

Do not force current HOLD THE LINE participants through reacceptance during this
implementation, rewrite their historical agreements, or change their registration
or participation status. Recommended future behavior is advance notice followed
by existing users' explicit acceptance of revised Terms and acknowledgement of
revised Privacy through the established account-wide successor process, only
after separate approval and a live-event-safe schedule. Revised PPA and Rulebook
acceptance should apply prospectively to future registrations that present those
versions; do not manufacture replacement acceptance for an existing Event. The
operators must separately confirm the lawful basis and whether this recommended
acceptance/notice approach is sufficient before activating the policy.

The current account-wide legal successor workflow deliberately requires existing
accounts to accept/acknowledge the exact newly Effective Terms/Privacy pair.
Activating successor registry rows now could therefore interrupt those users.
No registry activation, acceptance bypass or gate modification is authorized
here. If the desired legal transition cannot preserve live-event access without
a write-flow change, stop the release and resolve it as a separate task.

Relevant primary guidance, consulted for this recommendation: the Irish Data
Protection Commission explains that further relevant information must be
provided before processing for another purpose, and the European Commission
describes compatibility assessment when reusing data for another purpose.
These support the recommended review and notice; they do not settle IronClad's
jurisdiction-specific legal basis. See [DPC transparency guidance](https://www.dataprotection.ie/en/individuals/know-your-rights/right-be-informed-transparency-article-13-14-gdpr)
and [European Commission data-processing principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en).

## Publication boundary

This implementation creates no new legal version. A future approved publication
must prepare successor corpus text and immutable PDFs, preserve predecessor
documents, update the exact delivery hashes and approved transition manifest,
validate the compatible application in Staging, and schedule activation under
the existing runbooks. Those actions require separate approval. Production
release readiness remains conditional on that legal transition decision.
