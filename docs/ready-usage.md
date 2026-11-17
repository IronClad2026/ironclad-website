# Ready usage on protected Staging

The cloud menu uses version **2 / 1**. Earlier activity remains available under **1 / 1 (legacy search era)**. [Admin → Ready usage](/admin/ready-usage) requires a current authorised admin account. Its **Test and reviewer activity** view reports opted-in designated Staging accounts. **Player adoption** is unavailable during the trial. The report uses inclusive Sydney calendar dates, with 7-day, 30-day and custom ranges of up to 366 days. The version filter applies to measured activity. The current prepared wording and its archived source examples are in the [answer catalogue](ready-menu-catalogue.md).

## What counts

| Event or metric | Definition |
| --- | --- |
| Manual opening | The player deliberately opens Ready from its dock. Restoring an open workspace, displaying the model or revealing the automatic greeting generates no opening event. |
| Intentional engagement | Choosing a morale reply, opening Help or requesting a live action records a generic engagement event. It contains neither a morale answer ID nor its wording. Category and question selections, submitted searches with a recorded outcome, destination clicks and accepted feedback also qualify. An opening alone, idle animation and rerenders do not qualify. |
| Unique engaged accounts | Distinct signed-in account keys with qualifying events during the selected period. This counts each account once across the range, even when it uses several sessions. |
| Engaged sessions | Distinct session keys with qualifying events during the selected period. The database groups accepted events by account and a random browser key kept in tab session storage. A gap of at least 30 minutes starts a new session. Docking, reopening and reloading within the window reuse the current session when its key is available. Account changes are separated by server-owned account identity. |
| Category and question selections | Deliberate choices of an allowlisted category or prepared question. Selecting a suggestion counts as a question selection. A direct search match has its own search outcome and may later count as an answer display. |
| Answer displays | A prepared, sourced answer reaches the end of its reveal or the player shows its full text. Each display has a random answer instance ID. The event measures presentation and cannot establish that the player read the answer. |
| Action clicks | The player activates a Ready destination link or copy action. The server resolves the destination category from the action ID. A result-workspace click, Discord click or in-site assistance click records opening a destination. A copy click records the attempt. Workflow completion is outside this report. |
| Historical category-only flags | Earlier versions of **Topic missing** recorded only the selected category, or **Unknown category** from the main menu. Opening the current suggestion form records no analytics flag. |
| Legacy search outcomes | Retained version 1 records may include a match, ambiguous result, or no result. The cloud menu records no searches. |
| Fallbacks and errors | The fallback event counts a fully displayed no-result, unavailable or unsupported response. Technical errors use the fixed codes `request_failed`, `invalid_reply` or `timeout`. One interaction can produce both a fallback and an error or unmatched outcome. |
| Answer usefulness | **Helpful** and **Still need help** are optional. Each answer instance accepts at most one vote for the displayed question and version. Sample size is the total of both choices. Support clicks have no bearing on usefulness or outcome. |

The trend reports daily manual openings, answer displays and destination clicks. Reports cover measured traffic, so they can omit people who decline and events that could not be recorded. Missing data and archived groups below the reporting threshold are shown as gaps in coverage. Exact account and session counts are available only for periods covered by retained event detail. The report never sums daily unique counts.

## Consent, collection and retention

- In Ready’s **Main menu → Ready analytics**, the separate **Allow Ready usage analytics** checkbox is off by default. The server saves this choice for the active account. The existing **Analytics choices** control for public-site analytics and legal acknowledgement are separate. Ready’s answers and actions work with collection off. Interactions before opt-in are discarded.
- Turning the setting off stops the current tab, aborts pending event requests and clears its browser key. When withdrawal is saved, the server changes the consent epoch and removes session keys, so other tabs and stale retries cannot record any further events under that choice. If saving fails, the current tab remains paused and offers **Turn off** to retry. Recorded events remain subject to the retention and account-closure rules below.
- `GET /api/ready/usage` returns the current choice. Same-origin `POST` accepts a choice or an event, with a 640-byte JSON body limit. Event requests carry a random event ID, a tab key, the active consent epoch and only validated event fields. The server checks the reviewer’s current sign-in, profile, account requirements and consent. It derives identity, destination type, version and Staging reviewer classification. The database assigns the timestamp and session key and limits accepted events to 120 per account per minute. One transient client retry reuses the same event ID. Usage failures do not block the assistant or destinations.
- Event detail holds an opaque account key, server-assigned session and time, event ID, versions, allowlisted category, question and action IDs, destination category and limited outcomes or vote fields. The private consent record associates the opaque key with the player account. These keys are treated as personal information. Usage storage excludes raw queries, transcript or answer text, names and contact or platform identifiers, private URLs, match references, replay paths, fingerprints and motion recordings. The tables have row-level security and no direct player access. Only server-side service credentials can use reporting and write functions, and the Admin page exposes aggregates.
- [The Staging migration](../supabase/migrations/20261117090000_ready_usage_tracking.sql) maintains up to 90 days of detail. The hourly `ironclad-ready-usage-retention` job, registered when `pg_cron` is available, drops events before today minus 88 Sydney dates and expires unused session records after one day. It retains eligible daily counts for up to 12 months, with no account, session, browser or event identifiers. Each archived group requires at least five contributing accounts. Account closure or deletion removes the consent record, session mappings and linked event detail. Already aggregated daily counts contain no account key for individual removal.

The approved hosted Staging SQL consists of
`20261117090000_ready_usage_tracking.sql`, `20261117143000_ready_cloud_usage.sql`,
and `20261117190000_ready_topic_suggestions.sql`. The Staging migration ledger
records them by name as `ready_usage_tracking`, `ready_cloud_usage`, and
`ready_topic_suggestions`. The archived `20261116121500_ready_ai_budget.sql`
has no authorised hosted application. Ready's Staging trial does not use Cloudflare AI.

## Written suggestions on protected Staging

[Admin → Ready usage → Missing-topic suggestions](/admin/ready-usage?view=suggestions)
shows voluntary suggestions submitted through Ready's **Topic missing** form.
Signed-out visitors and eligible signed-in accounts can send a suggestion even
when optional usage analytics is off. Opening the form, typing and cancelling
do not save or send the draft. Ready explains who reviews the text before Send.
The separate **Contact an admin** option leads to immediate support options.

Each saved record contains the description, a random submission ID, the
submission time, the selected category when known, menu/catalogue versions and
review status. The app sends no account ID, match context or contact details with
the written record. Suggestions and their text are excluded from usage
analytics and session recordings. Historical category-only flags remain in their
own analytics section and have no written descriptions.

An authorised Staging admin can move a suggestion between **New**, **Reviewed**
and **Added to menu**, or permanently delete it from the suggestion list.
The hourly `ironclad-ready-suggestions-retention` job deletes suggestions older
than 90 days. For abuse protection only, an isolated table counts up to five
successful submissions per hour per signed-in account or visitor address using a
keyed digest. There is no link from that table to any suggestion and no raw
address or account ID stored in it. The same job removes elapsed hourly buckets.

The in-form notice applies to this protected Staging feature. Existing published
policy versions and historical acceptance records remain intact.

## Proposed public-release wording

Draft for operator review. The effective policy covers limited optional public-site measurement. Introduce the following in a separately versioned successor before enabling public Ready measurement. Preserve the archived documents and immutable acceptance records. Use a separate, unselected Ready choice with the notice visible before consent. [Effective Privacy Policy v1.3](https://www.ironcladtournaments.com/privacy)

**Text beside the Ready choice**

> Optional Ready usage analytics helps us improve the IronClad assistant. If you allow it, we count deliberate interactions such as selected topics, answers shown, destination clicks and optional helpfulness votes. We use a random identifier linked to your IronClad account to count engaged accounts without displaying player histories. We do not collect what you type, your morale choice or private match details in Ready analytics. Ready works with this setting off. You can turn it off at any time from Ready’s Main menu. See the Privacy Policy for retention and account closure.

Use **Allow Ready usage analytics** and **Turn off Ready usage analytics** for the two choices.

| Policy section | Proposed addition |
| --- | --- |
| §2 Scope | This Policy also covers optional analytics for the Ready assistant when a signed-in player separately opts in. |
| §§3–4 Information and sources | After your opt-in, your use of Ready supplies counts of deliberate openings, selections, displayed answers, clicks by destination category, optional Topic missing flags by known category, fallbacks, fixed error codes and optional usefulness votes. We keep a record of your choice and its date, an opaque identifier linked to your IronClad account, and random event, session and answer identifiers. We also record timestamps, menu and catalogue versions, and approved topic and action codes. Excluded data includes conversation text, morale choices, names and contact details, match references, private links, replay paths, fingerprints and recordings. |
| §§5–6 Purpose and optional consent | We use Ready analytics to measure engagement with prepared answers and navigation, identify topics that need improvement and assess usability. It is optional and uses a separate consent choice. We do not use it for advertising, named-player histories, eligibility, rankings or tournament decisions. |
| §§15–16 Providers and access | Ready usage events travel through the IronClad application hosted on Vercel and are stored in IronClad’s Supabase PostgreSQL database. Authorised administrators see aggregate reports. Ready usage events are not sent to Vercel Web Analytics. The hosting and database providers may process the data in accordance with this Policy’s international processing provisions. |
| §17 Browser storage | With your Ready analytics choice enabled, Ready uses tab session storage to remember a random key for grouping events within a session. Tab storage can also preserve a pending withdrawal while it is retried. Ready uses the separate account choice to authorise collection. |
| §§18–19 Retention and closure | We keep detailed Ready usage events for up to 90 days. Daily totals with no account or session identifiers are retained for up to 12 months. Older groups with fewer than five contributing accounts are removed. Closing or deleting an account removes its choice, session mappings and any Ready usage events that can still be linked to the account. Eligible daily totals can remain until they expire. |
| §20 Changing your choice | In Ready’s Main menu, open Ready analytics to decline or withdraw. Your choice applies to your signed-in account and does not affect use of Ready. Withdrawal stops future collection once saved. Events already recorded follow the retention schedule. Contact the privacy address in this Policy to exercise applicable rights. |

Before public release, confirm the proposed data scope, default-off control, time limits, account-closure behavior and actual processor arrangements against the release implementation. Publish the approved successor under a new version and use a fresh Ready-specific choice. The Staging reviewer choice does not carry over to public use.
