import type { Locale } from "@/lib/i18n/config";

const en = {
  coverage: "Official Caster Coverage", history: "Verified IronClad Coverage", studioTitle: "Official Casting Assignments",
  upcoming: "Scheduled assignments", past: "Past assignments", empty: "You have no official casting assignments yet.",
  unavailable: "Casting assignments are temporarily unavailable.",
  tournament: "Tournament", division: "Division", match: "Match",
  scheduled: "Scheduled", completed: "Completed and verified", cancelled: "Cancelled", unfulfilled: "Unfulfilled",
  tournamentLink: "View tournament", matchLink: "View match", bracketsLink: "View brackets",
  broadcast: "Watch broadcast", recording: "Watch recording", media: "Open tournament media", historicalMatch: "Historical match",
};

export type CasterCoverageCopy = typeof en;

const copy: Record<Locale, CasterCoverageCopy> = {
  en,
  it: {
    coverage: "Copertura ufficiale dei caster", history: "Copertura IronClad verificata", studioTitle: "Incarichi ufficiali di commento",
    upcoming: "Incarichi programmati", past: "Incarichi passati", empty: "Non hai ancora incarichi ufficiali di commento.",
    unavailable: "Gli incarichi di commento sono temporaneamente non disponibili.",
    tournament: "Torneo", division: "Divisione", match: "Incontro",
    scheduled: "Programmato", completed: "Completato e verificato", cancelled: "Annullato", unfulfilled: "Non effettuato",
    tournamentLink: "Vedi torneo", matchLink: "Vedi incontro", bracketsLink: "Vedi tabelloni",
    broadcast: "Guarda la diretta", recording: "Guarda la registrazione", media: "Apri i contenuti del torneo", historicalMatch: "Incontro storico",
  },
  "zh-CN": {
    coverage: "官方赛事解说", history: "经核实的 IronClad 解说记录", studioTitle: "官方解说安排",
    upcoming: "已安排的解说任务", past: "过往解说任务", empty: "你还没有官方解说任务。", unavailable: "暂时无法加载解说任务。",
    tournament: "赛事", division: "组别", match: "对局", scheduled: "已安排", completed: "已完成并核实", cancelled: "已取消", unfulfilled: "未履行",
    tournamentLink: "查看赛事", matchLink: "查看对局", bracketsLink: "查看对阵表",
    broadcast: "观看直播", recording: "观看录像", media: "打开赛事媒体", historicalMatch: "历史对局",
  },
  ru: {
    coverage: "Официальные трансляции", history: "Подтверждённые трансляции IronClad", studioTitle: "Официальные назначения на трансляции",
    upcoming: "Запланированные назначения", past: "Прошедшие назначения", empty: "У вас пока нет официальных назначений на трансляции.",
    unavailable: "Список назначений временно недоступен.",
    tournament: "Турнир", division: "Дивизион", match: "Матч",
    scheduled: "Запланировано", completed: "Завершено и подтверждено", cancelled: "Отменено", unfulfilled: "Не состоялось",
    tournamentLink: "Открыть турнир", matchLink: "Открыть матч", bracketsLink: "Открыть турнирные сетки",
    broadcast: "Смотреть трансляцию", recording: "Смотреть запись", media: "Открыть материалы турнира", historicalMatch: "Архивный матч",
  },
  es: {
    coverage: "Cobertura oficial de comentaristas", history: "Cobertura verificada de IronClad", studioTitle: "Asignaciones oficiales de retransmisión",
    upcoming: "Asignaciones programadas", past: "Asignaciones anteriores", empty: "Aún no tienes asignaciones oficiales de retransmisión.",
    unavailable: "Las asignaciones de retransmisión no están disponibles temporalmente.",
    tournament: "Torneo", division: "División", match: "Partida",
    scheduled: "Programada", completed: "Completada y verificada", cancelled: "Cancelada", unfulfilled: "No realizada",
    tournamentLink: "Ver torneo", matchLink: "Ver partida", bracketsLink: "Ver cuadros",
    broadcast: "Ver retransmisión", recording: "Ver grabación", media: "Abrir contenido del torneo", historicalMatch: "Partida histórica",
  },
  "pt-BR": {
    coverage: "Cobertura oficial de casters", history: "Cobertura verificada da IronClad", studioTitle: "Atribuições oficiais de transmissão",
    upcoming: "Atribuições agendadas", past: "Atribuições anteriores", empty: "Você ainda não tem atribuições oficiais de transmissão.",
    unavailable: "As atribuições de transmissão estão temporariamente indisponíveis.",
    tournament: "Torneio", division: "Divisão", match: "Partida",
    scheduled: "Agendada", completed: "Concluída e verificada", cancelled: "Cancelada", unfulfilled: "Não realizada",
    tournamentLink: "Ver torneio", matchLink: "Ver partida", bracketsLink: "Ver chaves",
    broadcast: "Assistir à transmissão", recording: "Assistir à gravação", media: "Abrir mídia do torneio", historicalMatch: "Partida histórica",
  },
  ko: {
    coverage: "공식 캐스터 중계", history: "검증된 IronClad 중계 기록", studioTitle: "공식 중계 배정",
    upcoming: "예정된 중계 배정", past: "지난 중계 배정", empty: "아직 공식 중계 배정이 없습니다.", unavailable: "현재 중계 배정을 불러올 수 없습니다.",
    tournament: "대회", division: "디비전", match: "경기", scheduled: "예정", completed: "완료 및 확인됨", cancelled: "취소됨", unfulfilled: "이행되지 않음",
    tournamentLink: "대회 보기", matchLink: "경기 보기", bracketsLink: "대진표 보기",
    broadcast: "중계 보기", recording: "녹화 영상 보기", media: "대회 미디어 열기", historicalMatch: "이전 경기",
  },
  fr: {
    coverage: "Couverture officielle des casters", history: "Couverture IronClad vérifiée", studioTitle: "Missions officielles de diffusion",
    upcoming: "Missions programmées", past: "Missions passées", empty: "Vous n’avez pas encore de mission officielle de diffusion.",
    unavailable: "Les missions de diffusion sont temporairement indisponibles.",
    tournament: "Tournoi", division: "Division", match: "Match",
    scheduled: "Prévue", completed: "Terminée et vérifiée", cancelled: "Annulée", unfulfilled: "Non effectuée",
    tournamentLink: "Voir le tournoi", matchLink: "Voir le match", bracketsLink: "Voir les tableaux",
    broadcast: "Voir la diffusion", recording: "Voir l’enregistrement", media: "Ouvrir les médias du tournoi", historicalMatch: "Match historique",
  },
};

export function getCasterCoverageCopy(locale: Locale = "en"): CasterCoverageCopy {
  return copy[locale];
}
