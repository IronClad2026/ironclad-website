import type { Locale } from "@/lib/i18n/config";

type Copy = {
  title: string;
  description: string;
  enabled: string;
  disabled: string;
  enable: string;
  disable: string;
  saving: string;
  saved: string;
  unavailable: string;
  failed: string;
};

const COPY: Record<Locale, Copy> = {
  en: {
    title: "Match Room activity",
    description: "Disabling stops new rooms, messages, assistance requests and read acknowledgments. Existing transcripts remain available, and administrators can resolve existing assistance requests. Tournament operations and other notifications continue.",
    enabled: "Enabled", disabled: "Disabled", enable: "Enable Match Room activity", disable: "Disable Match Room activity",
    saving: "Saving…", saved: "Match Room setting saved.", unavailable: "The current setting could not be verified.", failed: "The setting could not be saved. Please retry.",
  },
  it: {
    title: "Attività della stanza della partita",
    description: "La disattivazione blocca nuove stanze, messaggi, richieste di assistenza e conferme di lettura. Le conversazioni esistenti restano disponibili e gli amministratori possono risolvere le richieste esistenti. Le operazioni del torneo e le altre notifiche continuano.",
    enabled: "Attiva", disabled: "Disattivata", enable: "Attiva la stanza della partita", disable: "Disattiva la stanza della partita",
    saving: "Salvataggio…", saved: "Impostazione della stanza salvata.", unavailable: "Impossibile verificare l’impostazione attuale.", failed: "Impossibile salvare l’impostazione. Riprova.",
  },
  es: {
    title: "Actividad de la sala de partida",
    description: "Al desactivar, se detienen las nuevas salas, los mensajes, las solicitudes de ayuda y las confirmaciones de lectura. Los historiales siguen disponibles y los administradores pueden resolver las solicitudes existentes. Las operaciones del torneo y las demás notificaciones continúan.",
    enabled: "Activada", disabled: "Desactivada", enable: "Activar actividad de la sala", disable: "Desactivar actividad de la sala",
    saving: "Guardando…", saved: "Configuración de la sala guardada.", unavailable: "No se pudo verificar la configuración actual.", failed: "No se pudo guardar la configuración. Inténtalo de nuevo.",
  },
  fr: {
    title: "Activité du salon du match",
    description: "La désactivation bloque les nouveaux salons, messages, demandes d’aide et confirmations de lecture. Les conversations existantes restent disponibles et les administrateurs peuvent résoudre les demandes existantes. Le tournoi et les autres notifications continuent.",
    enabled: "Activée", disabled: "Désactivée", enable: "Activer l’activité du salon", disable: "Désactiver l’activité du salon",
    saving: "Enregistrement…", saved: "Paramètre du salon enregistré.", unavailable: "Impossible de vérifier le paramètre actuel.", failed: "Impossible d’enregistrer le paramètre. Réessayez.",
  },
  ko: {
    title: "경기 대화방 활동",
    description: "비활성화하면 새 대화방, 메시지, 도움 요청 및 읽음 확인이 중단됩니다. 기존 대화는 계속 볼 수 있으며 관리자는 기존 도움 요청을 해결할 수 있습니다. 대회 운영과 다른 알림은 계속됩니다.",
    enabled: "활성화됨", disabled: "비활성화됨", enable: "경기 대화방 활동 활성화", disable: "경기 대화방 활동 비활성화",
    saving: "저장 중…", saved: "경기 대화방 설정이 저장되었습니다.", unavailable: "현재 설정을 확인할 수 없습니다.", failed: "설정을 저장할 수 없습니다. 다시 시도하세요.",
  },
  "pt-BR": {
    title: "Atividade da sala da partida",
    description: "Desativar bloqueia novas salas, mensagens, solicitações de ajuda e confirmações de leitura. As conversas existentes continuam disponíveis e administradores podem resolver solicitações existentes. As operações do torneio e outras notificações continuam.",
    enabled: "Ativada", disabled: "Desativada", enable: "Ativar atividade da sala", disable: "Desativar atividade da sala",
    saving: "Salvando…", saved: "Configuração da sala salva.", unavailable: "Não foi possível verificar a configuração atual.", failed: "Não foi possível salvar a configuração. Tente novamente.",
  },
  ru: {
    title: "Активность комнаты матча",
    description: "Отключение блокирует новые комнаты, сообщения, запросы помощи и отметки о прочтении. Существующие переписки остаются доступными, а администраторы могут закрывать существующие запросы. Проведение турнира и другие уведомления продолжаются.",
    enabled: "Включена", disabled: "Отключена", enable: "Включить активность комнаты", disable: "Отключить активность комнаты",
    saving: "Сохранение…", saved: "Настройка комнаты сохранена.", unavailable: "Не удалось проверить текущую настройку.", failed: "Не удалось сохранить настройку. Повторите попытку.",
  },
  "zh-CN": {
    title: "比赛聊天室活动",
    description: "禁用后将停止创建聊天室、发送消息、发起求助和更新已读状态。现有聊天记录仍可查看，管理员仍可处理现有求助。赛事运行和其他通知不受影响。",
    enabled: "已启用", disabled: "已禁用", enable: "启用比赛聊天室活动", disable: "禁用比赛聊天室活动",
    saving: "正在保存…", saved: "比赛聊天室设置已保存。", unavailable: "无法确认当前设置。", failed: "无法保存设置，请重试。",
  },
};

export function getMatchRoomControlCopy(locale: Locale): Copy {
  return COPY[locale];
}
