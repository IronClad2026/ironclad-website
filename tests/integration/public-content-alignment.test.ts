import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 15B public competition content", () => {
  it("uses the approved native competition path on Home", () => {
    const home = source("app/page.tsx");

    expect(home).toContain("HOW IRONCLAD COMPETITION WORKS");
    expect(home).toContain(
      "Verify your Division, play through a structured eight-Player bracket, and build an official competitive record."
    );
    expect(home).toContain(
      "Connect Steam and verify your current Relic 1v1 ELO. IronClad places you in Academy, Challenge, or Main / Pro and locks that eligibility snapshot for the Event."
    );
    expect(home).toContain(
      "Play from the published Division map pool, use authenticated Dice for odd-Game roll-offs, and report the Series with one private .rec replay for every Game played. Your opponent can confirm or dispute the report."
    );
    expect(home).toContain(
      "Earn points through valid participation and progression. Academy and Challenge build permanent Career standings; Main / Pro runs in six-Event seasons."
    );
    expect(home).toContain('href: "/rules#one-v-one-rules"');
    expect(home).not.toMatch(/Battlefy|Main \/ Elite|4v4|currentTournaments/);
    expect(
      existsSync(resolve(process.cwd(), "components/CurrentTournamentCard.tsx"))
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "data/currentTournaments.ts"))
    ).toBe(false);
  });

  it("exposes only the approved Rules categories, draft statuses, and FAQs", () => {
    const rules = source("app/rules/page.tsx");

    expect(rules).toContain(
      'type TabName = "1V1 RULES" | "RANKINGS & SEASONS" | "PPA & CONDUCT";'
    );
    expect(rules).toContain("Revised Review Draft - Not Effective");
    expect(rules).toContain("Review Draft - Not Effective");
    expect(rules).toContain("Screenshots are not accepted as substitute Match-result proof");
    expect(rules).toMatch(/individual ballot attribution is private/i);
    expect(rules).toContain("anonymous public totals exist only when explicitly enabled");
    expect(rules).toContain("How do Dice, Side and Map choices work?");
    expect(rules).toContain("Does every Tournament have prizes?");
    expect(rules).not.toMatch(
      /4V4 RULES|Main \/ Elite|PDF_|documents-rules-ppa|Download PDF/
    );
  });

  it("uses neutral About and Rankings language while preserving true ties", () => {
    const about = source("app/about/page.tsx");
    const rankingsPage = source("app/rankings/page.tsx");
    const leaderboard = source("components/LeaderboardExperience.tsx");

    expect(about).toContain("Career and season standings");
    expect(about).toContain("Career and season rankings");
    expect(about).toContain(
      "Results build permanent Career standings or a six-Event Main / Pro season."
    );
    expect(about).not.toMatch(/Main \/ Elite|Seasonal leaderboard tracking|Seasonal Progress/);
    expect(rankingsPage).toContain("six-event Main / Pro season");
    expect(rankingsPage).not.toContain("prize season");
    expect(leaderboard).toContain("Main / Pro top standings");
    expect(leaderboard).toContain("Top Standings");
    expect(leaderboard).toMatch(
      /Every competitor sharing official Main \/ Pro rank 1, 2 or 3 remains\s+represented\./
    );
    expect(leaderboard).toMatch(
      /Any\s+prize-bearing Event is governed separately by its published Event\s+Prize Terms\./
    );
    expect(leaderboard).toMatch(
      /not\s+final while season review remains open/
    );
    expect(leaderboard).not.toMatch(/Prize Positions|cash prizes|prize settlement/);
  });

  it("keeps Battlefy in the labelled archive rather than current resources", () => {
    const tournaments = source("components/TournamentsExperience.tsx");

    expect(tournaments).toContain("Tournament Archive");
    expect(tournaments).toContain("pre-launch Battlefy archive");
    expect(tournaments).not.toContain("tournament.battlefyUrl");
    expect(tournaments).not.toContain("Battlefy Event");
  });

  it("uses the approved map, replay, and Poll tooltip copy", () => {
    const mapPools = source("components/TournamentMapPools.tsx");
    const replayForm = source("components/PlayerMatchResultForm.tsx");
    const polls = source("components/PollsAndDecisions.tsx");

    expect(mapPools).toContain(
      "This Division's map pool is public but may still be republished before launch. Launch freezes the pool."
    );
    expect(mapPools).toContain(
      "Launch has locked this Division's map pool. Only an audited Admin correction for a technical issue, exploit, game update or competitive-integrity reason may replace a Map."
    );
    expect(replayForm).toContain(
      "Upload one unique CoH3 .rec for each Game actually played. Each file may be up to 10 MiB. Replays are private, and screenshots are not accepted as substitute Match-result proof."
    );
    expect(polls).toContain(
      "Eligible votes inform the final Admin decision. The Published Decision may differ where the required rationale is provided."
    );
    expect(polls).toContain(
      "Eligible votes determine the configured top-K outcome once at least one valid ballot exists. A zero-ballot Poll is cancelled or replaced. Finalisation does not automatically change another subsystem."
    );
  });
});
