import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: {
    footer:
      "Questa è una notifica transazionale relativa a un torneo di IronClad Tournaments.",
  },
  labels: {
    tournament: "Torneo",
    division: "Divisione",
    round: "Turno",
    opponent: "Avversario",
    deadline: "Scadenza",
  },
  roundNames: {
    grandFinal: "Finalissima",
    final: "Finale",
    semifinals: "Semifinali",
    quarterfinals: "Quarti di finale",
    roundOf: "Turno da {count}",
    roundRobin: "Girone all'italiana",
  },
  registrationApproved: {
    subject: "Iscrizione approvata: {tournamentName}",
    heading: "La tua iscrizione è stata approvata",
    intro: "La tua iscrizione al torneo è stata approvata.",
    action: "Visualizza iscrizione",
  },
  divisionStarted: {
    subject: "Divisione iniziata — il tuo primo Match è pronto: {tournamentName}",
    heading: "La tua Divisione è iniziata",
    intro: "Il tuo primo Match è pronto per essere disputato.",
    action: "Visualizza Match",
  },
  laterRound: {
    subject: "{roundName}: il tuo Match è pronto — {tournamentName}",
    heading: "Il tuo prossimo Match è pronto",
    intro: "Entrambi i partecipanti ufficiali sono stati assegnati a questo Match.",
    action: "Visualizza Match",
  },
  deadline72h: {
    subject: "72 ore rimanenti per il tuo Match: {tournamentName}",
    heading: "Promemoria della scadenza del Match",
    intro: "La scadenza del tuo Match è prevista entro 72 ore.",
    action: "Visualizza Match",
  },
  deadline24h: {
    subject: "24 ore rimanenti per il tuo Match: {tournamentName}",
    heading: "Promemoria finale della scadenza del Match",
    intro: "La scadenza del tuo Match è prevista entro 24 ore.",
    action: "Visualizza Match",
  },
} satisfies EmailDictionary;

export default dictionary;
