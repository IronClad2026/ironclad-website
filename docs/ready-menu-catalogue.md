# Ready menu and answer catalogue

Menu version **2** and catalogue version **1** apply to the protected Staging trial. The [prepared-answer audit](ready-prepared-answer-audit.md) records the source checks for all 28 questions.

The **Most-used questions and prepared answers** section under **Admin → Ready usage** displays each exact question, reply and reading detail alongside its document title, edition, section and link. It uses the same resolver as the player menu and shows examples with archived document editions. The [menu definitions](../lib/ready/catalogue.ts), [prepared answers and available actions](../lib/ready/knowledge.ts) and [document editions](../lib/ready/knowledge-sources.ts) are the versioned source for those views.

| Main category | Prepared topics | Existing destinations |
| --- | --- | --- |
| My match | Deadline and opponent information come from the authorised match record. Separate choices open a current match or find a past match. | Tournament Brackets and the selected Match workspace, including opponent chat when available. |
| Results & replays | Results and confirmations, disputes, replay proof, submission restrictions. | The selected Match workspace and its result form or existing report. |
| Rules & match help | Disconnects and lag, no-shows, pauses, scheduling, map and side selection, factions, dice, lobby settings, match format, finals. | The selected Match workspace, official sources and Admin Assistance when appropriate. |
| Tournaments & registration | Events, Discord registration requirements, registration, waitlist, withdrawal, eligibility, divisions, prizes, decisions, official rules, governing editions, Terms, Participation Agreement and Privacy. | Tournaments, the selected event, registration, the Rules and Prizes panels, the Decisions tab and the official rules hub. |
| My profile & progress | This category presents links to existing player controls. | [Profile and Steam](/profile), [competition updates](/dashboard#player-notifications), [Career history](/dashboard#dashboard-history), [performance statistics](/dashboard#dashboard-statistics) and [Rankings](/rankings). |
| Contact an admin | Support options and copyable references use the selected owned match. The verified Discord ticket channel is available separately. | The caller’s existing Admin Assistance conversation, the Match Room’s in-site Get help control and the verified Discord ticket channel. |

The general answers cite Staging’s Rulebook 3.2, Participation Agreement 3.2, Terms 1.1 and Privacy 1.2 as applicable. An event-scoped reply uses the edition and verified document hash stored for the caller’s registration. If the recorded versions cannot be confirmed, Ready sends the player to official sources or support. Ready asks the caller to select an event or match when the supplied context leaves multiple eligible candidates.

The six cloud menus and their submenus send stable question and action identifiers. Replies may offer source links, a subsequent question, a navigation link or an authorised match reference. Opening a destination leaves submission, chat messages and assistance requests to the existing player controls. Ready’s route runs prepared answers and authorised reads.
