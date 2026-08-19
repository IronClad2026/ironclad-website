import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: { footer: "Это служебное турнирное уведомление от IronClad Tournaments." },
  labels: {
    tournament: "Турнир",
    division: "Дивизион",
    round: "Раунд",
    opponent: "Соперник",
    deadline: "Крайний срок",
  },
  roundNames: {
    grandFinal: "Гранд-финал",
    final: "Финал",
    semifinals: "Полуфиналы",
    quarterfinals: "Четвертьфиналы",
    roundOf: "Раунд на {count} участников",
    roundRobin: "Круговой этап",
  },
  registrationApproved: {
    subject: "Регистрация одобрена: {tournamentName}",
    heading: "Ваша регистрация одобрена",
    intro: "Ваша регистрация на турнир одобрена.",
    action: "Посмотреть регистрацию",
  },
  divisionStarted: {
    subject: "Дивизион стартовал — ваш первый матч готов: {tournamentName}",
    heading: "Ваш дивизион стартовал",
    intro: "Ваш первый матч готов к проведению.",
    action: "Открыть матч",
  },
  laterRound: {
    subject: "Матч раунда {roundName} готов: {tournamentName}",
    heading: "Ваш следующий матч готов",
    intro: "Оба официальных участника этого матча определены.",
    action: "Открыть матч",
  },
  deadline72h: {
    subject: "До крайнего срока матча осталось 72 часа: {tournamentName}",
    heading: "Напоминание о крайнем сроке матча",
    intro: "До крайнего срока вашего текущего матча осталось менее 72 часов.",
    action: "Открыть матч",
  },
  deadline24h: {
    subject: "До крайнего срока матча осталось 24 часа: {tournamentName}",
    heading: "Последнее напоминание о крайнем сроке матча",
    intro: "До крайнего срока вашего текущего матча осталось менее 24 часов.",
    action: "Открыть матч",
  },
} satisfies EmailDictionary;
export default dictionary;
