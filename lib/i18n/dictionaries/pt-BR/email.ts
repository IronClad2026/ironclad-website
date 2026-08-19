import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: { footer: "Esta é uma notificação transacional de torneio do IronClad Tournaments." },
  labels: {
    tournament: "Torneio",
    division: "Divisão",
    round: "Rodada",
    opponent: "Adversário",
    deadline: "Prazo",
  },
  registrationApproved: {
    subject: "Inscrição aprovada: {tournamentName}",
    heading: "Sua inscrição foi aprovada",
    intro: "Sua inscrição no torneio foi aprovada.",
    action: "Ver inscrição",
  },
  divisionStarted: {
    subject: "A divisão começou — seu primeiro confronto está pronto: {tournamentName}",
    heading: "Sua divisão começou",
    intro: "Seu primeiro confronto está pronto para ser jogado.",
    action: "Ver confronto",
  },
  laterRound: {
    subject: "Confronto de {roundName} pronto: {tournamentName}",
    heading: "Seu próximo confronto está pronto",
    intro: "Os dois participantes oficiais deste confronto já estão definidos.",
    action: "Ver confronto",
  },
  deadline72h: {
    subject: "Restam 72 horas para o prazo da sua partida: {tournamentName}",
    heading: "Lembrete do prazo da partida",
    intro: "O prazo da sua partida atual vence em menos de 72 horas.",
    action: "Ver confronto",
  },
  deadline24h: {
    subject: "Restam 24 horas para o prazo da sua partida: {tournamentName}",
    heading: "Lembrete final do prazo da partida",
    intro: "O prazo da sua partida atual vence em menos de 24 horas.",
    action: "Ver confronto",
  },
} satisfies EmailDictionary;
export default dictionary;
