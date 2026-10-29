import players from "./public-players";
import rankings from "./public-rankings";
import shared from "./public-shared";
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
  regions: shared.regions,
  home: {
    collaboration: {
      heading: "Collaborate with IronClad",
      body: "We welcome sponsorship enquiries, partnership proposals, and ideas for collaboration.",
      contact: "Contact us",
    },
    hero: {
      eyebrow: "Competitive Company of Heroes 3 Events",
      title: "IronClad Tournaments",
      description:
        "Join native 1v1 competition built around verified Divisions, fair play, permanent Career standings, and six-event Pro seasons.",
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
      choiceTitle: "Competitive identity",
      choiceText:
        "Active IronClad players have public competitive profiles. Discord contact is shown only when a player opts in.",
      ready: "READY",
      readyText:
        "Tournaments, profiles, players, and rules connected for the next competitive Event.",
    },
    players: {
      eyebrow: "IronClad Players",
      title: "Discover the Public Roster",
      description:
        "Browse active IronClad players, compare ELO, view competitive profiles, and use Discord contact where a player has opted in.",
      directory: "Player directory",
      privacy: "Competitive profile information is public for active players. Personal account information stays private; Discord contact is optional.",
      browse: "Browse Players",
    },
    path: {
      eyebrow: "COMPETITION PATH",
      title: "HOW IRONCLAD COMPETITION WORKS",
      description:
        "Verify your Division, play through a structured eight-Player bracket, and build an official competitive record.",
      verifyTitle: "VERIFIED 1V1",
      verifyText:
        "Connect Steam and verify your current Relic 1v1 ELO. IronClad places you in Academy, Challenge, Main, or Pro and locks that eligibility snapshot for the Event. Academy 0–1099 · Challenge 1100–1399 · Main 1400–1699 · Pro 1700+.",
      verifyCta: "VIEW TOURNAMENTS",
      reportTitle: "PLAY & REPORT",
      reportText:
        "Play from the published Division map pool, use authenticated Dice for odd-Game roll-offs, and report the Series with one private .rec replay for every Game played. Your opponent can confirm or dispute the report.",
      reportCta: "READ 1V1 RULES",
      progressTitle: "COMPETE & PROGRESS",
      progressText:
        "Academy, Challenge and Main build separate permanent Career standings. Pro uses six-valid-event seasons. Historical Main / Pro records remain separate.",
      progressCta: "VIEW RANKINGS",
    },
  },
  about: {
    proRange: "1700+ ELO",
    proText: "For elite competitors in official six-event Pro seasons.",
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
      "Academy, Challenge and Main build separate permanent Career standings. Pro uses six-valid-event seasons. Historical Main / Pro records remain separate.",
    structureEyebrow: "Tournament Structure",
    structureTitle: "Structured Events. Clear Progression.",
    structureText:
      "We run community Tournaments designed for different skill levels, from new competitive players to elite competitors. Each Event is built around clear rules, Bracket integrity, Match reporting, and competitive progression.",
    academyRange: "0–1099 ELO",
    academyText:
      "For players building competitive fundamentals in a protected skill range.",
    challengeRange: "1100–1399 ELO",
    challengeText:
      "For rising competitors pushing into sharper Brackets and stronger opponents.",
    mainRange: "1400–1699 ELO",
    mainText:
      "For experienced competitors building a permanent Main Career before the Pro division.",
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
  players: players.players,
  rankings: rankings.rankings,
  news: {
    title: "Official CoH3 News",
    intro: "Recent Company of Heroes 3 posts from Relic’s official Steam channel. Read each announcement at its original source.",
    sourceLabel: "Relic Entertainment · Official post via Steam",
    sourceLanguage: "Source articles are published in English.",
    readAnnouncement: "Read official announcement",
    opensNewTab: "Opens in a new tab",
    published: "Published",
    latestFromRelic: "Latest from Relic",
    viewAll: "View all news",
    moreOnSteam: "More official CoH3 news on Steam",
    unavailableTitle: "News is temporarily unavailable",
    unavailableDescription: "We couldn’t load the latest posts. You can still read official CoH3 announcements on Steam.",
    emptyTitle: "No recent news to display",
    emptyDescription: "Check Relic’s official CoH3 channel on Steam for more announcements.",
    fallbackLabel: "Official CoH3 news",
    disclaimer: "IronClad Tournaments is an independent community platform and is not affiliated with or endorsed by Relic Entertainment or Valve. Company of Heroes, Relic, Steam and related marks belong to their respective owners.",
    categoryLabel: "Category assigned by IronClad",
    categories: {
      patchNotes: "Patch notes",
      update: "Update",
      announcement: "Announcement",
    },
    metadataTitle: "Official CoH3 News & Patch Notes | IronClad",
    metadataDescription: "Browse recent Company of Heroes 3 news and patch notes from Relic’s official Steam channel, with short excerpts and links to the original announcements.",
  },
  announcements: {
    metadataTitle: "Official Announcements | IronClad",
    metadataDescription:
      "Read the latest official news and updates from IronClad.",
    eyebrow: "IronClad Broadcast",
    title: "Official Announcements",
    description:
      "News, Tournament notices, and platform updates published by IronClad.",
    feedLabel: "Official announcements feed",
    emptyTitle: "No announcements yet",
    emptyDescription:
      "Official IronClad updates will appear here when they are published.",
    published: "Published",
    publicationTimeUnavailable: "Publication time unavailable",
    imageAltFallback: "Image for “{title}”",
    videoLabelFallback: "Video for “{title}”",
    videoUnsupported: "Your browser does not support video playback.",
    viewTournament: "View Tournament",
    loadErrorTitle: "Announcements unavailable",
    loadErrorDescription:
      "IronClad could not load official announcements. Please try again.",
    retry: "Try again",
  },
  select: shared.select,
  playerCount: shared.playerCount,
} as const;

export type PublicDictionary = DictionaryShape<typeof dictionary>;

export default dictionary;
