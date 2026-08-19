import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: { footer: "Ceci est une notification transactionnelle de tournoi envoyée par IronClad Tournaments." },
  labels: {
    tournament: "Tournoi",
    division: "Division",
    round: "Tour",
    opponent: "Adversaire",
    deadline: "Échéance",
  },
  roundNames: {
    grandFinal: "Grande finale",
    final: "Finale",
    semifinals: "Demi-finales",
    quarterfinals: "Quarts de finale",
    roundOf: "Tour de {count}",
    roundRobin: "Toutes rondes",
  },
  registrationApproved: {
    subject: "Inscription approuvée : {tournamentName}",
    heading: "Votre inscription est approuvée",
    intro: "Votre inscription au tournoi a été approuvée.",
    action: "Voir l’inscription",
  },
  divisionStarted: {
    subject: "La division a commencé — votre premier match est prêt : {tournamentName}",
    heading: "Votre division a commencé",
    intro: "Votre premier match est prêt à être joué.",
    action: "Voir le match",
  },
  laterRound: {
    subject: "Match prêt ({roundName}) : {tournamentName}",
    heading: "Votre prochain match est prêt",
    intro: "Les deux participants officiels de ce match sont désormais définis.",
    action: "Voir le match",
  },
  deadline72h: {
    subject: "Il reste 72 heures avant l’échéance de votre match : {tournamentName}",
    heading: "Rappel d’échéance du match",
    intro: "Votre match actuel arrive à échéance dans moins de 72 heures.",
    action: "Voir le match",
  },
  deadline24h: {
    subject: "Il reste 24 heures avant l’échéance de votre match : {tournamentName}",
    heading: "Dernier rappel d’échéance du match",
    intro: "Votre match actuel arrive à échéance dans moins de 24 heures.",
    action: "Voir le match",
  },
} satisfies EmailDictionary;
export default dictionary;
