import shared from "./public-shared";

const dictionary = {
  rankings: {
    proDivision: "Pro",
    proCareer: "Pro Career",
    mainProgression: "Main Career",
    proSeason: "Pro Season",
    proAllTime: "Pro All-Time",
    proDescription: "Official Pro standings for the featured six-valid-event season.",
    proAllTimeDescription: "Permanent Pro standings across valid Pro events.",
    mainProgressionDescription: "Main progression standings for four-division events. Historical Main / Pro records remain in their archive.",
    mainProgressionScoring: "Main awards +10 participation, +5 per round advanced and +5 for winning; no late-entry bonus. The final win earns the winner bonus only.",
    officialScope: "Official Division Ranking",
    officialAllTimeRecord: "Every valid {division} point event contributes to this permanent record.",
    metadataTitle: "Leaderboard & Rankings | IronClad",
    metadataDescription:
      "Academy, Challenge and Main build separate permanent Career standings. Pro uses six-valid-event seasons. Historical Main / Pro records remain separate.",
    mainDivision: "Legacy · Main / Pro",
    mainSeason: "Legacy · Main / Pro Season",
    currentSeasonScope: "Current Season",
    allTimeScope: "All-Time",
    mainScope: "Legacy · Main / Pro Ranking",
    academyCareer: "Academy Career",
    challengeCareer: "Challenge Career",
    loadWarning:
      "Some Rankings data could not be loaded. This public page is showing every safe dataset currently available.",
    publicLeaderboard: "Public Rankings",
    dynamicStandings: "Dynamic Standings",
    mainDescription:
      "Legacy · Official Main / Pro standings for the featured six-valid-Event season.",
    mainAllTimeDescription:
      "Legacy · Permanent Main / Pro standings across every valid ranked Event, including the active season.",
    academyDescription:
      "Academy points and Results remain in this permanent Career view.",
    challengeDescription:
      "Challenge points and Results remain in this permanent Career view.",
    safeData: "All rows come from public-safe Rankings views.",
    visibleCompetitors: "Visible Competitors",
    rankingModel: "Ranking Model",
    sixEventSeason: "Six-Event season",
    permanentMainPro: "Legacy · Permanent Main / Pro",
    permanentCareer: "Permanent Career",
    seasonState: "Season State",
    division: "Division",
    heroEyebrow: "IronClad Competitive Command",
    heroTitle: "Leaderboard & Rankings",
    heroDescription:
      "Academy, Challenge and Main build separate permanent Career standings. Pro uses six-valid-event seasons. Historical Main / Pro records remain separate.",
    featuredSeason: "Featured Season",
    mainAllTime: "Legacy · Main / Pro All-Time",
    mainAllTimeRecord:
      "Legacy · Every valid Main / Pro point event contributes to this permanent record.",
    mainAllTimeNoReset:
      "Current-season points are included. The record does not reset when a season closes, and it does not determine current-season prize positions.",
    careerStandings: "Career Standings",
    seasonNotStarted: "Season not started",
    noSeason:
      "No qualifying season is underway. Standings begin with the first valid event.",
    careerRecord:
      "Points remain part of this division's permanent competitive record.",
    validEvents: "Valid qualifying events",
    proTransitionLabel: "Transitional Pro season",
    proTransitionNotice:
      "For this season, Event 1 was played under the previous structure, where Main / Pro was the highest division. It counts as Pro Event 1 of 6 while remaining historically Main / Pro. From Event 2 onward, only new Pro events (1700+ ELO) qualify; future Main events do not count.",
    underReviewNotice:
      "Season results are under review. Displayed standings are not final while season review remains open.",
    careerNoReset:
      "Academy, Challenge and Main build separate permanent Career standings. Pro uses six-valid-event seasons. Historical Main / Pro records remain separate.",
    competitors: "Competitors",
    season: "Season",
    state: "State",
    scope: "Scope",
    permanent: "Permanent",
    reset: "Reset",
    never: "Never",
    tba: "TBA",
    careerTitle: "{division} is a permanent Career standing.",
    careerSeparation:
      "Academy, Challenge and Main build separate permanent Career standings. Pro uses six-valid-event seasons. Historical Main / Pro records remain separate.",
    entrantBonus:
      "New Career entrants may receive +5 points per prior eligible event, awarded once per division, up to +25.",
    notStarted: "Not started",
    notStartedDescription: "Season not started.",
    underReview: "Under review",
    underReviewDescription:
      "Frozen historical standings remain displayed while the finalized season is under review.",
    finalized: "Finalized",
    finalizedDescription: "Finalized. These standings are frozen.",
    finalizationPending: "Finalization pending",
    finalizationPendingDescription:
      "Finalization pending. Automatic scoring and finalization should normally complete after the sixth valid event.",
    inProgress: "In progress",
    inProgressDescription: "Season in progress.",
    topUnavailable: "Official top standings unavailable",
    topUnavailableText:
      "Official competitive ranks will appear after valid results are published.",
    topAria: "Official top standings",
    finalStandings: "Final Standings",
    currentStandings: "Current Standings",
    topStandings: "Top Standings",
    tieNotice:
      "Every competitor sharing official rank 1, 2 or 3 remains represented. Display order does not change official rank. Any prize-bearing Event is governed separately by its published Event Prize Terms.",
    rank: "Rank",
    player: "Player",
    country: "Country",
    elo: "ELO",
    points: "Points",
    played: "Played",
    rounds: "Rounds",
    wins: "Wins",
    winRate: "Win Rate",
    lastPoints: "Last Pts",
    movement: "Movement",
    new: "NEW",
    noStandings: "No standings published yet",
    noStandingsText:
      "Rankings rows will appear after a valid Tournament completion is automatically recalculated.",
    history: "Tournament History",
    historyTitle: "Published Tournament Impact",
    historyEmpty:
      "Tournament history will appear here after Rankings recalculations are published.",
    dateTba: "Date TBA",
    pointsShort: "{points} pts",
    topScorer: "Top published scorer: {name}",
    championArchive: "Champion Archive",
    latestFinalized: "Latest Finalized Results",
    championsEmpty: "Season champions will appear here when a season closes.",
    rankNumber: "Rank #{rank}",
    unknown: "Unknown",
    unrated: "Unrated",
    academyBracket: "Academy Bracket",
    challengeBracket: "Challenge Bracket",
    aggregate: "Aggregate",
  },
  regions: shared.regions,
} as const;

export default dictionary;
