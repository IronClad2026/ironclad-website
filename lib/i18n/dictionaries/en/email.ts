import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  layout: {
    footer:
      "This is a transactional tournament notification from IronClad Tournaments.",
  },
  labels: {
    tournament: "Tournament",
    division: "Division",
    round: "Round",
    opponent: "Opponent",
    deadline: "Deadline",
  },
  roundNames: {
    grandFinal: "Grand Final",
    final: "Final",
    semifinals: "Semifinals",
    quarterfinals: "Quarterfinals",
    roundOf: "Round of {count}",
    roundRobin: "Round Robin",
  },
  registrationApproved: {
    subject: "Registration approved: {tournamentName}",
    heading: "Your registration is approved",
    intro: "Your tournament registration has been approved.",
    action: "View registration",
  },
  divisionStarted: {
    subject: "Division started - your first matchup is ready: {tournamentName}",
    heading: "Your division has started",
    intro: "Your first matchup is ready to play.",
    action: "View matchup",
  },
  laterRound: {
    subject: "{roundName} matchup ready: {tournamentName}",
    heading: "Your next matchup is ready",
    intro: "Both official participants are set for this matchup.",
    action: "View matchup",
  },
  deadline72h: {
    subject: "72 hours remaining for your match: {tournamentName}",
    heading: "Match deadline reminder",
    intro: "Your current match deadline is within 72 hours.",
    action: "View matchup",
  },
  deadline24h: {
    subject: "24 hours remaining for your match: {tournamentName}",
    heading: "Final match deadline reminder",
    intro: "Your current match deadline is within 24 hours.",
    action: "View matchup",
  },
} as const;
export type EmailDictionary = DictionaryShape<typeof dictionary>;
export default dictionary;
