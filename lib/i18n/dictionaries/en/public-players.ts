import shared from "./public-shared";

const dictionary = {
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
  regions: shared.regions,
  select: shared.select,
  playerCount: shared.playerCount,
} as const;

export default dictionary;
