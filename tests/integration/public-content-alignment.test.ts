import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import competition from "@/lib/i18n/dictionaries/en/competition";
import helpLegalUi from "@/lib/i18n/dictionaries/en/help-legal-ui";
import publicCopy from "@/lib/i18n/dictionaries/en/public";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 15B public competition content", () => {
  it("uses the approved native competition path on Home", () => {
    const home = source("app/page.tsx");
    const homeCopy = JSON.stringify(publicCopy.home);

    expect(publicCopy.home.path.title).toBe("HOW IRONCLAD COMPETITION WORKS");
    expect(publicCopy.home.path.description).toBe(
      "Verify your Division, play through a structured eight-Player bracket, and build an official competitive record."
    );
    expect(publicCopy.home.path.verifyText).toBe(
      "Connect Steam and verify your current Relic 1v1 ELO. IronClad places you in Academy, Challenge, or Main / Pro and locks that eligibility snapshot for the Event."
    );
    expect(publicCopy.home.path.reportText).toBe(
      "Play from the published Division map pool, use authenticated Dice for odd-Game roll-offs, and report the Series with one private .rec replay for every Game played. Your opponent can confirm or dispute the report."
    );
    expect(publicCopy.home.path.progressText).toBe(
      "Earn points through valid participation and progression. Academy and Challenge build permanent Career standings; Main / Pro runs in six-Event seasons."
    );
    expect(home).toContain('href: "/rules#one-v-one-rules"');
    expect(`${home}\n${homeCopy}`).not.toMatch(
      /Battlefy|Main \/ Elite|4v4|currentTournaments/
    );
    expect(
      existsSync(resolve(process.cwd(), "components/CurrentTournamentCard.tsx"))
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "data/currentTournaments.ts"))
    ).toBe(false);
  });

  it("exposes only the approved Rules categories, Effective documents, and FAQs", () => {
    const rulesPage = source("app/rules/page.tsx");
    const rulesExperience = source("components/rules/RulesExperience.tsx");
    const rulesCopy = JSON.stringify(helpLegalUi.rules);

    expect(Object.values(helpLegalUi.rules.tabs).map((tab) => tab.title)).toEqual([
      "1V1 RULES",
      "RANKINGS & SEASONS",
      "PPA & CONDUCT",
    ]);
    expect(helpLegalUi.rules.quick.documentStatusTitle).toBe(
      "Approved governing corpus"
    );
    expect(helpLegalUi.rules.documents.download).toBe("Download PDF");
    expect(helpLegalUi.rules.documents.readOnline).toBe("Read Online");
    expect(helpLegalUi.rules.sections.oneVOne.resultText).toContain(
      "Screenshots are not accepted as substitute Match-result proof"
    );
    expect(helpLegalUi.rules.sections.conduct.pollText).toMatch(
      /individual ballot attribution is private/i
    );
    expect(helpLegalUi.rules.sections.conduct.pollText).toContain(
      "anonymous public totals exist only when explicitly enabled"
    );
    expect(helpLegalUi.rules.faq.diceQuestion).toBe(
      "How do Dice, Side and Map choices work?"
    );
    expect(helpLegalUi.rules.faq.prizesQuestion).toBe(
      "Does every Tournament have prizes?"
    );
    expect(`${rulesPage}\n${rulesExperience}\n${rulesCopy}`).not.toMatch(
      /Review Draft|Not Effective|4V4 RULES|Main \/ Elite|PDF_/
    );
  });

  it("uses neutral About and Rankings language while preserving true ties", () => {
    const aboutCopy = JSON.stringify(publicCopy.about);
    const rankingsCopy = JSON.stringify(publicCopy.rankings);

    expect(publicCopy.about.careerStandings).toBe("Career and season standings");
    expect(publicCopy.about.careerRankings).toBe("Career and season rankings");
    expect(publicCopy.about.competitiveProgressText).toBe(
      "Results build permanent Career standings or a six-Event Main / Pro season."
    );
    expect(aboutCopy).not.toMatch(
      /Main \/ Elite|Seasonal leaderboard tracking|Seasonal Progress/
    );
    expect(publicCopy.rankings.metadataDescription).toContain(
      "six-event Main / Pro season"
    );
    expect(rankingsCopy).not.toContain("prize season");
    expect(publicCopy.rankings.topAria).toBe("Main / Pro top standings");
    expect(publicCopy.rankings.topStandings).toBe("Top Standings");
    expect(publicCopy.rankings.tieNotice).toMatch(
      /Every competitor sharing official Main \/ Pro rank 1, 2 or 3 remains\s+represented\./
    );
    expect(publicCopy.rankings.tieNotice).toMatch(
      /Any\s+prize-bearing Event is governed separately by its published Event\s+Prize Terms\./
    );
    expect(publicCopy.rankings.underReviewNotice).toMatch(
      /not final while season review remains open/
    );
    expect(rankingsCopy).not.toMatch(
      /Prize Positions|cash prizes|prize settlement/
    );
  });

  it("keeps Battlefy in the labelled archive rather than current resources", () => {
    const tournaments = source("components/TournamentsExperience.tsx");

    expect(competition.tournaments.overview.archive).toBe("Tournament Archive");
    expect(competition.tournaments.overview.archiveDescription).toContain(
      "Battlefy"
    );
    expect(competition.tournaments.overview.archiveDescription).toContain(
      "before the new IronClad platform launch"
    );
    expect(tournaments).not.toContain("tournament.battlefyUrl");
    expect(tournaments).not.toContain("Battlefy Event");
  });

  it("uses the approved map, replay, and Poll tooltip copy", () => {
    expect(competition.mapPools.publishedHelp).toBe(
      "This Division's map pool is public but may still be republished before launch. Launch freezes the pool."
    );
    expect(competition.mapPools.frozenHelp).toBe(
      "Launch has locked this Division's map pool. Only an audited Admin correction for a technical issue, exploit, game update or competitive-integrity reason may replace a Map."
    );
    expect(competition.resultForm.replayHelp).toBe(
      "Upload one unique CoH3 .rec for each Game actually played. Each file may be up to 10 MiB. Replays are private, and screenshots are not accepted as substitute Match-result proof."
    );
    expect(competition.polls.advisoryHelp).toBe(
      "Eligible votes inform the final Admin decision. The Published Decision may differ where the required rationale is provided."
    );
    expect(competition.polls.bindingHelp).toBe(
      "Eligible votes determine the configured top-K outcome once at least one valid ballot exists. A zero-ballot Poll is cancelled or replaced. Finalisation does not automatically change another subsystem."
    );
  });
});
