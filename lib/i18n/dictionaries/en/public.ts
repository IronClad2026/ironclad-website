import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  metadata: {
    rootTitle: "IronClad Tournaments | Competitive Company of Heroes 3",
    rootDescription: "Join structured Company of Heroes 3 Tournaments with verified Divisions, fair play, and official Rankings.",
    aboutTitle: "About IronClad | Company of Heroes 3 Tournaments",
    aboutDescription: "Learn how IronClad runs fair, structured Company of Heroes 3 Tournaments and long-term competitive Rankings.",
    manifestName: "IronClad Tournaments",
    manifestDescription: "Competitive Company of Heroes 3 Tournaments, player profiles, Matches, and Rankings.",
  },
  regions: { europe: "Europe", northAmerica: "North America", southAmerica: "South America", oceania: "Oceania", asia: "Asia", middleEast: "Middle East", africa: "Africa", global: "Global" },
  home: {
    hero: {
      eyebrow: "Competitive Company of Heroes 3 Events",
      title: "IronClad Tournaments",
      description:
        "Join native 1v1 competition built around verified Divisions, fair play, permanent Career standings, and six-event Main / Pro seasons.",
      viewTournaments: "View Tournaments",
      joinDiscord: "Join Discord (Optional)",
      launchFormat: "Launch format",
      divisionSize: "Division size",
      integrityModel: "Integrity model",
      fairPlay: "Fair play",
    },
    command: {
      label: "IronClad command brief",
      online: "Operations Online",
      integrityTitle: "Competitive integrity",
      integrityText:
        "Clear rules and Admin review support fair, structured competition.",
      tournamentsTitle: "Structured Tournaments",
      tournamentsText:
        "Brackets, schedules, and Tournament updates remain easy to follow.",
      choiceTitle: "Player choice",
      choiceText:
        "Public profiles and Discord contact appear only when players choose to share them.",
      ready: "READY",
      readyText:
        "Tournaments, profiles, players, and rules connected for the next competitive Event.",
    },
    players: {
      eyebrow: "IronClad Players",
      title: "Discover the Public Roster",
      description:
        "Browse players who choose to appear publicly, compare ELO, view public profiles, and use Discord contact where a player has opted in.",
      directory: "Player directory",
      privacy: "Public profile details are limited to player-approved fields.",
      browse: "Browse Players",
    },
    path: {
      eyebrow: "COMPETITION PATH",
      title: "HOW IRONCLAD COMPETITION WORKS",
      description:
        "Verify your Division, play through a structured eight-Player bracket, and build an official competitive record.",
      verifyTitle: "VERIFIED 1V1",
      verifyText:
        "Connect Steam and verify your current Relic 1v1 ELO. IronClad places you in Academy, Challenge, or Main / Pro and locks that eligibility snapshot for the Event.",
      verifyCta: "VIEW TOURNAMENTS",
      reportTitle: "PLAY & REPORT",
      reportText:
        "Play from the published Division map pool, use authenticated Dice for odd-Game roll-offs, and report the Series with one private .rec replay for every Game played. Your opponent can confirm or dispute the report.",
      reportCta: "READ 1V1 RULES",
      progressTitle: "COMPETE & PROGRESS",
      progressText:
        "Earn points through valid participation and progression. Academy and Challenge build permanent Career standings; Main / Pro runs in six-Event seasons.",
      progressCta: "VIEW RANKINGS",
    },
  },
  about: {
    heroEyebrow: "Built for Competitive Company of Heroes 3",
    heroTitle: "IronClad Tournaments",
    heroDescription:
      "A community-driven Tournament platform built to give Company of Heroes 3 players a structured, competitive, and fair place to compete.",
    joinTournament: "Join Tournament",
    viewRankings: "View Rankings",
    joinDiscord: "Join Discord",
    tacticalSystem: "TACTICAL EVENT SYSTEM",
    seasonReady: "SEASON READY",
    seasonReadyText:
      "Brackets, verification, Match reporting, and Rankings prepared for competitive play.",
    missionEyebrow: "Mission",
    missionTitle: "A Competitive Home for CoH3 Players",
    missionText:
      "IronClad exists to support the Company of Heroes 3 competitive scene with organised Tournaments, clear rules, fair Brackets, Career and season Rankings, and a serious community environment.",
    clearRules: "Clear Rules",
    clearRulesText: "Every Event starts from visible expectations.",
    fairBrackets: "Fair Brackets",
    fairBracketsText: "Players compete inside defined ELO ranges.",
    competitiveProgress: "Competitive Progress",
    competitiveProgressText:
      "Results build permanent Career standings or a six-Event Main / Pro season.",
    structureEyebrow: "Tournament Structure",
    structureTitle: "Structured Events. Clear Progression.",
    structureText:
      "We run community Tournaments designed for different skill levels, from new competitive players to elite competitors. Each Event is built around clear rules, Bracket integrity, Match reporting, and competitive progression.",
    academyRange: "Below 1100 ELO",
    academyText:
      "For players building competitive fundamentals in a protected skill range.",
    challengeRange: "1100–1399 ELO",
    challengeText:
      "For rising competitors pushing into sharper Brackets and stronger opponents.",
    mainRange: "1400+ ELO",
    mainText:
      "For top competitors fighting for the highest IronClad placements.",
    integrityEyebrow: "Integrity",
    integrityTitle: "Fair Competition Comes First",
    integrityText:
      "IronClad uses ELO verification, profile checks, Admin review, structured Match reporting, proof uploads, and Rankings controls to protect Tournament integrity.",
    eloVerification: "ELO verification",
    adminApproval: "Admin approval",
    proofResults: "Proof-based Match Results",
    careerStandings: "Career and season standings",
    impersonationChecks: "Anti-impersonation checks",
    clearTournamentRules: "Clear Tournament rules",
    communityEyebrow: "Community",
    communityTitle: "Built by the Community. For the Community.",
    communityText:
      "IronClad is built around players, Admins, casters, and the wider Company of Heroes 3 community. The goal is to create a competitive environment where players can improve, compete, and be recognised.",
    players: "Players",
    playersText: "A place to test skill, track progress, and earn recognition.",
    staff: "Competitive Staff",
    staffText: "Admins and casters supporting clear outcomes and better Events.",
    futureEyebrow: "Future Vision",
    futureTitle: "Building the Future of CoH3 Competition",
    futureText:
      "IronClad is more than a Tournament website. It is a long-term project built to grow the Company of Heroes 3 competitive scene through better Events, stronger community tools, Career and season Rankings, and professional Tournament experiences.",
    betterEvents: "Better Events",
    strongerTools: "Stronger community tools",
    careerRankings: "Career and season rankings",
    professionalExperiences: "Professional Tournament experiences",
    enterBattlefield: "Enter the Battlefield",
    registerTournament: "Register for a Tournament",
    viewLeaderboard: "View Leaderboard",
  },
  players: {
    metadataTitle: "Players Directory | IronClad",
    metadataDescription:
      "Browse public IronClad Company of Heroes 3 player profiles and competitive ratings.",
    eyebrow: "IronClad Roster",
    title: "Players Directory",
    description:
      "Browse public IronClad commanders, competitive ELO ratings, regions, and opt-in Discord availability.",
    privacy:
      "Only player-approved profile fields are shown. Private profiles are not listed.",
    commanders: "Public Commanders",
    directorySafe:
      "Directory data is limited to public-safe player profile fields.",
    search: "Search Player",
    searchPlaceholder: "Search by player name",
    eloFilter: "ELO",
    eloPlaceholder: "Filter by ELO",
    countryFilter: "Country",
    countryPlaceholder: "Search countries",
    playerOne: "Player",
    playerMany: "Players",
    noPlayers: "No public players available yet.",
    noMatches: "No public players match those filters.",
    emptyHelp:
      "Public player cards will appear here once eligible IronClad profiles are available through the public profile boundary.",
    allCountries: "All countries",
    allElo: "All ELO ratings",
    unrated: "Unrated",
    unknown: "Unknown",
    regionUnknown: "Region unknown",
    viewProfile: "Public Profile",
    avatarLabel: "{name} avatar",
    back: "Back to Players",
    profileEyebrow: "IronClad Public Profile",
    currentElo: "Current ELO",
    country: "Country",
    region: "Region",
    division: "Division",
    discordAvailable: "Discord contact available",
    unknownCountry: "Unknown country",
    competitiveRecord: "Competitive Record",
    publicStats: "Public Stats",
    publicStatsText:
      "Player-approved competitive information from the public IronClad data boundary.",
    tournamentHistory: "Tournament History",
    tournamentHistoryText:
      "Public Tournament history will appear here once a public-safe Tournament summary is available.",
    matchStatistics: "Match Statistics",
    matchStatisticsText:
      "Public Match statistics will appear here once wins, losses, and Match history are available through the public data boundary.",
    comingLater: "Coming later",
    discordUnavailable: "Discord contact not available.",
    discordUnavailableText:
      "This player has not opted into public Discord contact.",
    discordContact: "Discord Contact",
    discordOptedIn: "This player has opted into public Discord contact.",
    contactPlayer: "Contact Player",
    discordUsername: "Discord Username",
    copied: "Copied to clipboard.",
    copyFailed: "Clipboard access was unavailable. Copy the username manually.",
    notFoundTitle: "Player Not Found | IronClad",
    profileMetadataTitle: "{name} | IronClad Player Profile",
    profileMetadataDescription: "Public IronClad player profile for {name}.",
  },
  rankings: {
    metadataTitle: "Leaderboard & Rankings | IronClad",
    metadataDescription:
      "Track the six-event Main / Pro season and permanent Academy and Challenge Career standings.",
    mainSeason: "Main / Pro Season",
    academyCareer: "Academy Career",
    challengeCareer: "Challenge Career",
    loadWarning:
      "Some Rankings data could not be loaded. This public page is showing every safe dataset currently available.",
    publicLeaderboard: "Public Rankings",
    dynamicStandings: "Dynamic Standings",
    mainDescription:
      "Official Main / Pro standings for the featured six-valid-Event season.",
    academyDescription:
      "Academy points and Results remain in this permanent Career view.",
    challengeDescription:
      "Challenge points and Results remain in this permanent Career view.",
    safeData: "All rows come from public-safe Rankings views.",
    visibleCompetitors: "Visible Competitors",
    rankingModel: "Ranking Model",
    sixEventSeason: "Six-Event season",
    permanentCareer: "Permanent Career",
    seasonState: "Season State",
    division: "Division",
    heroEyebrow: "IronClad Competitive Command",
    heroTitle: "Leaderboard & Rankings",
    heroDescription:
      "Main / Pro is the authoritative six-valid-event season. Academy and Challenge track separate permanent Career standings.",
    featuredSeason: "Featured Main / Pro Season",
    careerStandings: "Career Standings",
    seasonNotStarted: "Season not started",
    noSeason:
      "No qualifying season is underway. Standings begin with the first valid Main / Pro event.",
    careerRecord:
      "Points remain part of this division's permanent competitive record.",
    validEvents: "Valid qualifying events",
    underReviewNotice:
      "Season results are under review. Displayed standings are not final while season review remains open.",
    careerNoReset:
      "Career points do not reset when a Main / Pro season finishes and remain separate from the other Career division.",
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
      "Points do not reset when a Main / Pro season finishes. Academy history remains Academy history, Challenge history remains Challenge history, and neither Career standing carries into Main / Pro season standings.",
    entrantBonus:
      "New Career entrants may receive +5 points per prior eligible event, awarded once per division, up to +25.",
    notStarted: "Not started",
    notStartedDescription: "Season not started.",
    underReview: "Under review",
    underReviewDescription:
      "Frozen historical standings remain displayed while the finalized season is under review.",
    finalized: "Finalized",
    finalizedDescription: "Finalized. These Main / Pro standings are frozen.",
    finalizationPending: "Finalization pending",
    finalizationPendingDescription:
      "Finalization pending. Automatic scoring and finalization should normally complete after the sixth valid event.",
    inProgress: "In progress",
    inProgressDescription: "Season in progress.",
    topUnavailable: "Main / Pro top standings unavailable",
    topUnavailableText:
      "Official competitive ranks will appear after valid Main / Pro results are published.",
    topAria: "Main / Pro top standings",
    finalStandings: "Final Main / Pro Standings",
    currentStandings: "Current Main / Pro Standings",
    topStandings: "Top Standings",
    tieNotice:
      "Every competitor sharing official Main / Pro rank 1, 2 or 3 remains represented. Display order does not change official rank. Any prize-bearing Event is governed separately by its published Event Prize Terms.",
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
    championArchive: "Main / Pro Champion Archive",
    latestFinalized: "Latest Finalized Results",
    championsEmpty: "Season champions will appear here when a season closes.",
    rankNumber: "Rank #{rank}",
    unknown: "Unknown",
    unrated: "Unrated",
    academyBracket: "Academy Bracket",
    challengeBracket: "Challenge Bracket",
    aggregate: "Aggregate",
  },
  select: {
    noOptions: "No options found.",
  },
  playerCount: {
    one: "Player",
    few: "Players",
    many: "Players",
  },
} as const;

export type PublicDictionary = DictionaryShape<typeof dictionary>;

export default dictionary;
