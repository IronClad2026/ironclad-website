import type { Locale } from "@/lib/i18n/config";
import { PUBLIC_PROFILE_NOTICE_VERSION, PUBLIC_PROFILE_TRANSITION_NOTICE_VERSION, type PublicProfileNoticeVersion } from "@/lib/public-gaming-profile-notice";

type NoticeCopy = {
  title: string;
  publicFields: string;
  legacyVisibility?: string;
  contact: string;
  privateFields: string;
  checkbox: string;
  submit: string;
  pending: string;
  requiredError: string;
  saveError: string;
  retry: string;
  options: string;
  privacy: string;
  support: string;
  closeAccount: string;
  signOut: string;
  closeDescription: string;
  closeConfirmation: string;
  closeError: string;
  closeProviderError: string;
  closed: string;
  returnToNotice: string;
};

const COPY = {
  en: {
    title: "Public gaming profiles and tournament information",
    publicFields: "Visitors can see your IronClad gaming profile without signing in. It can show your display name, in-game name, country, competitive region, rating and avatar, along with tournament participation, results, standings and competition history. Showcase content you publish can also appear.",
    contact: "Your Discord contact is public only if you turn on its separate visibility setting.",
    privateFields: "Your email address, login credentials, private match chat, private assistance conversations and restricted replay files are not publicly visible. See our Privacy Policy for the exact information displayed and how we protect your personal information.",
    checkbox: "I acknowledge that the gaming-profile and tournament information described above is publicly visible.",
    submit: "Acknowledge and continue",
    pending: "Saving…",
    requiredError: "Tick the acknowledgement box to continue.",
    saveError: "The acknowledgement could not be verified or saved. Please try again.",
    retry: "Try again",
    options: "Account and support options",
    privacy: "Privacy Policy",
    support: "Contact support on Discord",
    closeAccount: "Close account",
    signOut: "Sign out",
    closeDescription: "Closing your account removes your sign-in and profile. IronClad preserves required tournament records according to its account-closure policy.",
    closeConfirmation: "Type DELETE to confirm.",
    closeError: "Account closure could not be completed. Please try again or contact support.",
    closeProviderError: "Your IronClad identity is closed. Contact support to complete removal of your sign-in.",
    closed: "Your account is closed.",
    returnToNotice: "Return to the notice",
  },
  it: {
    title: "Profili di gioco pubblici e informazioni sui tornei",
    publicFields: "Chiunque può vedere il tuo profilo di gioco IronClad senza accedere. Il profilo può mostrare il nome visualizzato, il nome di gioco, il paese, la regione competitiva, il punteggio, l’avatar, la partecipazione ai tornei, i risultati, le classifiche e la cronologia competitiva. Possono comparire anche i contenuti che pubblichi nella vetrina.",
    contact: "Il tuo contatto Discord è pubblico solo se attivi la relativa impostazione di visibilità.",
    privateFields: "L’indirizzo email, le credenziali di accesso, le chat private delle partite, le conversazioni private con l’assistenza e i file di replay ad accesso limitato non sono visibili al pubblico. Consulta l’informativa sulla privacy per sapere quali informazioni mostriamo e come proteggiamo i tuoi dati personali.",
    checkbox: "Prendo atto che le informazioni sul profilo di gioco e sui tornei descritte sopra sono visibili al pubblico.",
    submit: "Prendi atto e continua",
    pending: "Salvataggio in corso…",
    requiredError: "Seleziona la casella per continuare.",
    saveError: "Non è stato possibile verificare o salvare la presa d’atto. Riprova.",
    retry: "Riprova",
    options: "Opzioni per l’account e l’assistenza",
    privacy: "Informativa sulla privacy",
    support: "Contatta l’assistenza su Discord",
    closeAccount: "Chiudi account",
    signOut: "Esci",
    closeDescription: "La chiusura dell’account rimuove l’accesso e il profilo. IronClad conserva i dati dei tornei necessari secondo la propria politica di chiusura degli account.",
    closeConfirmation: "Digita DELETE per confermare.",
    closeError: "Non è stato possibile chiudere l’account. Riprova o contatta l’assistenza.",
    closeProviderError: "Il tuo account IronClad è chiuso. Contatta l’assistenza per completare la rimozione dell’accesso.",
    closed: "Il tuo account è chiuso.",
    returnToNotice: "Torna all’avviso",
  },
  "zh-CN": {
    title: "公开游戏档案和赛事信息",
    publicFields: "访客无需登录即可查看你的 IronClad 游戏档案。其中可能显示你的显示名称、游戏内名称、国家或地区、竞技赛区、评分和头像，以及参赛记录、比赛结果、排名和竞技历史。你发布的展示内容也可能公开显示。",
    contact: "只有在你开启单独的可见性设置后，访客才能看到你的 Discord 联系方式。",
    privateFields: "你的电子邮件地址、登录凭据、私人比赛聊天、私人求助对话和受限回放文件不会公开显示。请查看《隐私政策》，了解具体公开的信息以及我们如何保护你的个人信息。",
    checkbox: "我知悉上述游戏档案和赛事信息公开可见。",
    submit: "确认知悉并继续",
    pending: "正在保存…",
    requiredError: "请勾选知悉确认框后继续。",
    saveError: "无法验证或保存你的确认，请重试。",
    retry: "重试",
    options: "账户和支持选项",
    privacy: "隐私政策",
    support: "在 Discord 上联系支持人员",
    closeAccount: "关闭账户",
    signOut: "退出登录",
    closeDescription: "关闭账户会移除登录权限和档案。IronClad 会依据账户关闭政策保留必要的赛事记录。",
    closeConfirmation: "输入 DELETE 确认。",
    closeError: "无法完成账户关闭。请重试或联系支持人员。",
    closeProviderError: "你的 IronClad 账户已关闭。请联系支持人员完成登录账户的移除。",
    closed: "你的账户已关闭。",
    returnToNotice: "返回通知",
  },
  ru: {
    title: "Открытые игровые профили и сведения о турнирах",
    publicFields: "Посетители могут просматривать ваш игровой профиль IronClad без входа в аккаунт. В нём могут отображаться имя профиля, имя в игре, страна, соревновательный регион, рейтинг и аватар, а также участие в турнирах, результаты, позиции в рейтингах и история соревнований. Опубликованные вами материалы витрины также могут быть видны.",
    contact: "Ваш контакт в Discord доступен публично только при включении отдельной настройки видимости.",
    privateFields: "Ваш адрес электронной почты, данные для входа, личные чаты матчей, приватные обращения в поддержку и файлы повторов с ограниченным доступом публично не отображаются. В Политике конфиденциальности указано, какие данные видны и как мы защищаем вашу личную информацию.",
    checkbox: "Я подтверждаю, что мне известно о публичной доступности описанных выше сведений об игровом профиле и турнирах.",
    submit: "Подтвердить и продолжить",
    pending: "Сохранение…",
    requiredError: "Установите флажок, чтобы продолжить.",
    saveError: "Не удалось проверить или сохранить подтверждение. Попробуйте ещё раз.",
    retry: "Повторить",
    options: "Параметры аккаунта и поддержки",
    privacy: "Политика конфиденциальности",
    support: "Обратиться в поддержку в Discord",
    closeAccount: "Закрыть аккаунт",
    signOut: "Выйти",
    closeDescription: "Закрытие аккаунта удаляет возможность входа и профиль. IronClad сохраняет необходимые записи о турнирах согласно правилам закрытия аккаунта.",
    closeConfirmation: "Введите DELETE для подтверждения.",
    closeError: "Не удалось закрыть аккаунт. Попробуйте снова или обратитесь в поддержку.",
    closeProviderError: "Ваш аккаунт IronClad закрыт. Обратитесь в поддержку, чтобы завершить удаление данных для входа.",
    closed: "Ваш аккаунт закрыт.",
    returnToNotice: "Вернуться к уведомлению",
  },
  es: {
    title: "Perfiles de juego públicos e información de torneos",
    publicFields: "Los visitantes pueden ver tu perfil de juego de IronClad sin iniciar sesión. Puede mostrar tu nombre visible, nombre en el juego, país, región competitiva, puntuación y avatar, además de tu participación en torneos, resultados, clasificaciones e historial competitivo. También puede aparecer el contenido que publiques en tu escaparate.",
    contact: "Tu contacto de Discord solo es público si activas su ajuste de visibilidad independiente.",
    privateFields: "Tu correo electrónico, credenciales de acceso, chats privados de partidas, conversaciones privadas de asistencia y archivos de repetición restringidos no son visibles al público. Consulta nuestra Política de privacidad para saber qué información mostramos y cómo protegemos tus datos personales.",
    checkbox: "Confirmo que he entendido que la información del perfil de juego y de los torneos descrita arriba es visible al público.",
    submit: "Confirmar y continuar",
    pending: "Guardando…",
    requiredError: "Marca la casilla de confirmación para continuar.",
    saveError: "No se pudo verificar ni guardar la confirmación. Vuelve a intentarlo.",
    retry: "Volver a intentar",
    options: "Opciones de cuenta y asistencia",
    privacy: "Política de privacidad",
    support: "Contactar con asistencia en Discord",
    closeAccount: "Cerrar cuenta",
    signOut: "Cerrar sesión",
    closeDescription: "Cerrar tu cuenta elimina tu acceso y tu perfil. IronClad conserva los registros de torneos necesarios según su política de cierre de cuentas.",
    closeConfirmation: "Escribe DELETE para confirmar.",
    closeError: "No se pudo cerrar la cuenta. Vuelve a intentarlo o contacta con asistencia.",
    closeProviderError: "Tu cuenta de IronClad está cerrada. Contacta con asistencia para completar la eliminación del acceso.",
    closed: "Tu cuenta está cerrada.",
    returnToNotice: "Volver al aviso",
  },
  "pt-BR": {
    title: "Perfis de jogo públicos e informações de torneios",
    publicFields: "Visitantes podem ver seu perfil de jogo no IronClad sem fazer login. Ele pode mostrar seu nome de exibição, nome no jogo, país, região competitiva, pontuação e avatar, além da participação em torneios, resultados, classificações e histórico competitivo. O conteúdo que você publicar na vitrine também pode aparecer.",
    contact: "Seu contato no Discord só fica público se você ativar a configuração de visibilidade separada.",
    privateFields: "Seu e-mail, credenciais de login, bate-papos privados de partidas, conversas privadas de suporte e arquivos de replay com acesso restrito não ficam visíveis ao público. Consulte a Política de Privacidade para saber exatamente o que é exibido e como protegemos seus dados pessoais.",
    checkbox: "Estou ciente de que as informações do perfil de jogo e dos torneios descritas acima são visíveis ao público.",
    submit: "Confirmar ciência e continuar",
    pending: "Salvando…",
    requiredError: "Marque a caixa de confirmação para continuar.",
    saveError: "Não foi possível verificar ou salvar a confirmação. Tente novamente.",
    retry: "Tentar novamente",
    options: "Opções de conta e suporte",
    privacy: "Política de Privacidade",
    support: "Entrar em contato com o suporte no Discord",
    closeAccount: "Encerrar conta",
    signOut: "Sair",
    closeDescription: "Encerrar sua conta remove seu acesso e seu perfil. O IronClad mantém os registros de torneios necessários de acordo com a política de encerramento de contas.",
    closeConfirmation: "Digite DELETE para confirmar.",
    closeError: "Não foi possível encerrar a conta. Tente novamente ou entre em contato com o suporte.",
    closeProviderError: "Sua conta IronClad foi encerrada. Entre em contato com o suporte para concluir a remoção do acesso.",
    closed: "Sua conta foi encerrada.",
    returnToNotice: "Voltar ao aviso",
  },
  ko: {
    title: "공개 게임 프로필 및 대회 정보",
    publicFields: "방문자는 로그인하지 않아도 IronClad 게임 프로필을 볼 수 있습니다. 표시 이름, 게임 내 이름, 국가, 경쟁 지역, 평점, 아바타와 함께 대회 참가 기록, 결과, 순위 및 경쟁 기록이 표시될 수 있습니다. 직접 공개한 쇼케이스 콘텐츠도 표시될 수 있습니다.",
    contact: "Discord 연락처는 별도의 공개 설정을 켠 경우에만 공개됩니다.",
    privateFields: "이메일 주소, 로그인 정보, 비공개 경기 채팅, 비공개 지원 대화 및 접근이 제한된 리플레이 파일은 공개되지 않습니다. 표시되는 정보와 개인정보 보호 방법은 개인정보 처리방침을 확인하세요.",
    checkbox: "위에 설명된 게임 프로필 및 대회 정보가 공개된다는 점을 확인합니다.",
    submit: "확인하고 계속하기",
    pending: "저장 중…",
    requiredError: "계속하려면 확인란을 선택하세요.",
    saveError: "확인 여부를 검증하거나 저장할 수 없습니다. 다시 시도해 주세요.",
    retry: "다시 시도",
    options: "계정 및 지원 옵션",
    privacy: "개인정보 처리방침",
    support: "Discord에서 지원 문의하기",
    closeAccount: "계정 닫기",
    signOut: "로그아웃",
    closeDescription: "계정을 닫으면 로그인과 프로필이 삭제됩니다. IronClad는 계정 폐쇄 정책에 따라 필요한 대회 기록을 보관합니다.",
    closeConfirmation: "확인하려면 DELETE를 입력하세요.",
    closeError: "계정을 닫지 못했습니다. 다시 시도하거나 지원팀에 문의하세요.",
    closeProviderError: "IronClad 계정이 닫혔습니다. 로그인 계정 삭제를 완료하려면 지원팀에 문의하세요.",
    closed: "계정이 닫혔습니다.",
    returnToNotice: "알림으로 돌아가기",
  },
  fr: {
    title: "Profils de jeu publics et informations sur les tournois",
    publicFields: "Les visiteurs peuvent voir votre profil de jeu IronClad sans se connecter. Il peut afficher votre nom d’affichage, votre nom en jeu, votre pays, votre région de compétition, votre cote et votre avatar, ainsi que vos participations aux tournois, résultats, classements et historique compétitif. Le contenu que vous publiez dans votre vitrine peut aussi apparaître.",
    contact: "Votre contact Discord est public uniquement si vous activez son paramètre de visibilité distinct.",
    privateFields: "Votre adresse e-mail, vos identifiants de connexion, vos discussions privées de match, vos échanges privés avec l’assistance et vos fichiers de replay à accès restreint ne sont pas visibles publiquement. Consultez notre Politique de confidentialité pour connaître les informations affichées et la manière dont nous protégeons vos données personnelles.",
    checkbox: "Je reconnais que les informations sur le profil de jeu et les tournois décrites ci-dessus sont visibles publiquement.",
    submit: "Reconnaître et continuer",
    pending: "Enregistrement…",
    requiredError: "Cochez la case pour continuer.",
    saveError: "La confirmation n’a pas pu être vérifiée ou enregistrée. Veuillez réessayer.",
    retry: "Réessayer",
    options: "Options du compte et de l’assistance",
    privacy: "Politique de confidentialité",
    support: "Contacter l’assistance sur Discord",
    closeAccount: "Fermer le compte",
    signOut: "Se déconnecter",
    closeDescription: "La fermeture de votre compte supprime votre accès et votre profil. IronClad conserve les données de tournoi nécessaires conformément à sa politique de fermeture de compte.",
    closeConfirmation: "Saisissez DELETE pour confirmer.",
    closeError: "Le compte n’a pas pu être fermé. Veuillez réessayer ou contacter l’assistance.",
    closeProviderError: "Votre compte IronClad est fermé. Contactez l’assistance pour terminer la suppression de votre accès.",
    closed: "Votre compte est fermé.",
    returnToNotice: "Revenir à l’avis",
  },
} satisfies Record<Locale, NoticeCopy>;

const TRANSITION_COPY = {
  en: {
    publicFields: "Visitors can see core gaming profiles and official tournament records without signing in. Core profiles can show an in-game name, an IronClad profile link, competitive region or division, and current ELO. Official records can show approved event names, participation, roster ELO, brackets, results, standings and tournament history.",
    legacyVisibility: "The policy applies to existing and new profiles. Optional details such as a different display name, country, avatar and eligible Showcase content need separate permission. A recorded privacy objection under review restricts the individual gaming profile. Acknowledging this notice does not grant permission to share optional details.",
    checkbox: "I acknowledge how IronClad displays gaming profiles and official tournament information.",
  },
  it: {
    publicFields: "Chiunque può vedere i dati essenziali dei profili di gioco e i registri ufficiali dei tornei senza accedere. Il profilo può mostrare il nome di gioco, il link al profilo IronClad, la regione competitiva o la divisione e l’ELO attuale. I registri ufficiali possono mostrare il nome approvato per l’evento, la partecipazione, l’ELO della rosa, i tabelloni, i risultati, le classifiche e la cronologia dei tornei.",
    legacyVisibility: "La politica si applica ai profili esistenti e a quelli nuovi. Dati facoltativi come un nome visualizzato diverso, il paese, l’avatar e i contenuti idonei della vetrina richiedono un permesso separato. Se è in corso l’esame di un’opposizione per motivi di privacy, la visibilità del singolo profilo è limitata. La presa d’atto non autorizza la condivisione dei dati facoltativi.",
    checkbox: "Prendo atto di come IronClad mostra i profili di gioco e le informazioni ufficiali sui tornei.",
  },
  "zh-CN": {
    publicFields: "访客无需登录即可查看游戏资料的核心信息和官方赛事记录。核心信息可能包括游戏内名称、IronClad 资料链接、竞技赛区或组别以及当前 ELO。官方记录可能显示获准使用的参赛名称、参赛情况、名单中的 ELO、对阵表、赛果、排名和赛事历史。",
    legacyVisibility: "此政策适用于现有资料和新建资料。不同的显示名称、国家、头像及符合条件的展示内容等可选信息需要单独授权。如果已记录的隐私异议正在审核，该玩家的游戏资料将限制公开。确认此通知不会授权分享可选信息。",
    checkbox: "我已知悉 IronClad 如何展示游戏资料和官方赛事信息。",
  },
  ru: {
    publicFields: "Основные данные игровых профилей и официальные записи турниров доступны без входа в аккаунт. Профиль может показывать игровой псевдоним, ссылку на профиль IronClad, соревновательный регион или дивизион и текущий ELO. Официальные записи могут показывать утверждённое имя участника, участие, ELO в заявке, турнирную сетку, результаты, таблицы и историю турниров.",
    legacyVisibility: "Политика распространяется на существующие и новые профили. Для дополнительных сведений, таких как отдельное отображаемое имя, страна, аватар и допустимые материалы витрины, требуется отдельное разрешение. Если зарегистрированное возражение по поводу конфиденциальности ещё рассматривается, доступ к игровому профилю ограничен. Ознакомление с уведомлением не разрешает публикацию дополнительных сведений.",
    checkbox: "Подтверждаю, что ознакомился с тем, как IronClad показывает игровые профили и официальную информацию о турнирах.",
  },
  es: {
    publicFields: "Los visitantes pueden ver los datos básicos de los perfiles de juego y los registros oficiales de torneos sin iniciar sesión. El perfil puede mostrar el nombre en el juego, el enlace al perfil de IronClad, la región competitiva o división y el ELO actual. Los registros oficiales pueden mostrar el nombre aprobado para el evento, la participación, el ELO registrado, los cuadros, los resultados, las clasificaciones y el historial de torneos.",
    legacyVisibility: "La política se aplica a perfiles existentes y nuevos. Los datos opcionales, como un nombre visible distinto, el país, el avatar y el contenido destacado apto, requieren un permiso separado. Una objeción de privacidad registrada y pendiente de revisión restringe el perfil de esa persona. Confirmar la lectura del aviso no autoriza a compartir datos opcionales.",
    checkbox: "Confirmo que he leído cómo IronClad muestra los perfiles de juego y la información oficial de los torneos.",
  },
  "pt-BR": {
    publicFields: "Visitantes podem ver os dados básicos dos perfis de jogo e os registros oficiais de torneios sem fazer login. O perfil pode mostrar o nome no jogo, o link do perfil do IronClad, a região competitiva ou divisão e o ELO atual. Os registros oficiais podem mostrar o nome aprovado para o evento, a participação, o ELO registrado, as chaves, os resultados, as classificações e o histórico de torneios.",
    legacyVisibility: "A política se aplica a perfis existentes e novos. Dados opcionais, como um nome de exibição diferente, país, avatar e conteúdo elegível da vitrine, exigem uma permissão separada. Uma objeção de privacidade registrada e ainda em análise restringe o perfil da pessoa. Confirmar a leitura deste aviso não autoriza a divulgação de dados opcionais.",
    checkbox: "Confirmo que li como o IronClad exibe os perfis de jogo e as informações oficiais dos torneios.",
  },
  ko: {
    publicFields: "방문자는 로그인 없이 게임 프로필의 기본 정보와 공식 대회 기록을 볼 수 있습니다. 기본 정보에는 게임 내 이름, IronClad 프로필 링크, 경쟁 지역 또는 디비전, 현재 ELO가 표시될 수 있습니다. 공식 기록에는 승인된 대회 참가 이름, 참가 내역, 명단에 기록된 ELO, 대진표, 결과, 순위 및 대회 이력이 표시될 수 있습니다.",
    legacyVisibility: "이 정책은 기존 프로필과 새 프로필에 적용됩니다. 별도의 표시 이름, 국가, 아바타, 공개 요건을 충족한 쇼케이스 콘텐츠 등의 선택 정보는 별도 허가가 필요합니다. 개인정보 공개에 대한 이의 제기가 접수되어 검토 중인 경우 해당 게임 프로필의 공개가 제한됩니다. 이 안내를 확인해도 선택 정보 공유가 허용되지는 않습니다.",
    checkbox: "IronClad가 게임 프로필과 공식 대회 정보를 어떻게 표시하는지 확인했습니다.",
  },
  fr: {
    publicFields: "Les visiteurs peuvent consulter les informations essentielles des profils de jeu et les archives officielles des tournois sans se connecter. Le profil peut afficher le nom en jeu, le lien du profil IronClad, la région de compétition ou la division, et l’ELO actuel. Les archives officielles peuvent afficher le nom approuvé pour l’événement, la participation, l’ELO inscrit, les tableaux, les résultats, les classements et l’historique des tournois.",
    legacyVisibility: "La politique s’applique aux profils existants et nouveaux. Les informations facultatives, comme un nom d’affichage différent, le pays, l’avatar et les contenus admissibles de la vitrine, nécessitent une autorisation distincte. Une opposition enregistrée et en cours d’examen restreint le profil de la personne concernée. Prendre connaissance de cet avis n’autorise pas le partage des informations facultatives.",
    checkbox: "Je reconnais avoir pris connaissance de la façon dont IronClad affiche les profils de jeu et les informations officielles des tournois.",
  },
} satisfies Record<Locale, Pick<NoticeCopy, "publicFields" | "legacyVisibility" | "checkbox">>;

export function getPublicGamingProfileNoticeCopy(
  locale: Locale,
  version: PublicProfileNoticeVersion = PUBLIC_PROFILE_NOTICE_VERSION,
): NoticeCopy {
  return version === PUBLIC_PROFILE_TRANSITION_NOTICE_VERSION
    ? { ...COPY[locale], ...TRANSITION_COPY[locale] }
    : COPY[locale];
}
