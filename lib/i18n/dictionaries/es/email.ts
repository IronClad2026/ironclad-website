import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: { footer: "Esta es una notificación transaccional de torneos de IronClad Tournaments." },
  labels: {
    tournament: "Torneo",
    division: "División",
    round: "Ronda",
    opponent: "Rival",
    deadline: "Fecha límite",
  },
  registrationApproved: {
    subject: "Inscripción aprobada: {tournamentName}",
    heading: "Tu inscripción ha sido aprobada",
    intro: "Tu inscripción en el torneo ha sido aprobada.",
    action: "Ver inscripción",
  },
  divisionStarted: {
    subject: "La división ha comenzado: tu primer enfrentamiento está listo: {tournamentName}",
    heading: "Tu división ha comenzado",
    intro: "Tu primer enfrentamiento ya está listo para jugarse.",
    action: "Ver enfrentamiento",
  },
  laterRound: {
    subject: "Enfrentamiento de {roundName} listo: {tournamentName}",
    heading: "Tu próximo enfrentamiento está listo",
    intro: "Los dos participantes oficiales de este enfrentamiento ya están definidos.",
    action: "Ver enfrentamiento",
  },
  deadline72h: {
    subject: "Quedan 72 horas para la fecha límite de tu partida: {tournamentName}",
    heading: "Recordatorio de la fecha límite de la partida",
    intro: "La fecha límite de tu partida actual vence en menos de 72 horas.",
    action: "Ver enfrentamiento",
  },
  deadline24h: {
    subject: "Quedan 24 horas para la fecha límite de tu partida: {tournamentName}",
    heading: "Recordatorio final de la fecha límite de la partida",
    intro: "La fecha límite de tu partida actual vence en menos de 24 horas.",
    action: "Ver enfrentamiento",
  },
} satisfies EmailDictionary;
export default dictionary;
