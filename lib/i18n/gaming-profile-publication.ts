import type { Locale } from "@/lib/i18n/config";

type GamingProfilePublicationCopy = {
  heading: string;
  description: string;
  newProfileDisclosure: string;
  legacyDescription: string;
  publicationStatus: string;
  privateStatus: string;
  objectionStatus: string;
  publish: string;
  keepPrivate: string;
  saving: string;
  saved: string;
  conflict: string;
  unavailable: string;
  confirmationLabel: string;
};

const COPY = {
  en: {
    heading: "Optional gaming profile details",
    description: "Your in-game name, public profile link, competitive region or division, and current ELO can be public. Official tournament records are published separately. Discord has its own visibility setting.",
    newProfileDisclosure: "Your profile starts with core information visible to visitors. Optional details stay private until you choose to share them.",
    legacyDescription: "Choose whether to share the optional details on your profile. You can change that choice later.",
    publicationStatus: "You share optional profile details.",
    privateStatus: "Your optional profile details are private.",
    objectionStatus: "Your gaming profile is restricted while we review a privacy objection.",
    publish: "Share optional details",
    keepPrivate: "Hide optional details",
    saving: "Saving…",
    saved: "Your sharing choice was saved.",
    conflict: "Your sharing choice changed in another session. Reload this page and try again.",
    unavailable: "Your sharing choice could not be updated. Try again or contact support.",
    confirmationLabel: "I choose to share the optional details described in the Privacy Policy. They can include a different display name, country, avatar, eligible Showcase content and non-official event snapshots. The authorized competition integration may also receive my verified Relic identifier and profile link.",
  },
  it: {
    heading: "Dati facoltativi del profilo di gioco",
    description: "Il nome di gioco, il link al profilo pubblico, la regione competitiva o la divisione e l’ELO attuale possono essere pubblici. I registri ufficiali dei tornei sono pubblicati separatamente. Discord ha una propria impostazione di visibilità.",
    newProfileDisclosure: "All’inizio, chiunque può vedere i dati essenziali del profilo. I dati facoltativi restano privati finché non scegli di condividerli.",
    legacyDescription: "Puoi scegliere se condividere i dati facoltativi del profilo. Potrai cambiare la scelta in seguito.",
    publicationStatus: "Condividi i dati facoltativi del profilo.",
    privateStatus: "I dati facoltativi del profilo sono privati.",
    objectionStatus: "La visibilità del tuo profilo è limitata mentre esaminiamo un’opposizione per motivi di privacy.",
    publish: "Condividi i dati facoltativi",
    keepPrivate: "Nascondi i dati facoltativi",
    saving: "Salvataggio in corso…",
    saved: "La scelta di condivisione è stata salvata.",
    conflict: "La scelta è cambiata in un’altra sessione. Ricarica la pagina e riprova.",
    unavailable: "Non è stato possibile aggiornare la scelta. Riprova o contatta l’assistenza.",
    confirmationLabel: "Scelgo di condividere i dati facoltativi descritti nell’informativa sulla privacy, come un nome visualizzato diverso, il paese, l’avatar, i contenuti idonei della vetrina e i dati non ufficiali degli eventi. L’integrazione competitiva autorizzata può anche ricevere il mio identificativo Relic verificato e il link al profilo.",
  },
  "zh-CN": {
    heading: "游戏资料的可选信息",
    description: "游戏内名称、公开资料链接、竞技赛区或组别以及当前 ELO 可以公开。官方赛事记录会单独公布。Discord 有独立的可见性设置。",
    newProfileDisclosure: "创建资料后，访客可以看到核心信息。可选信息会保持私密，直到你选择分享。",
    legacyDescription: "你可以选择是否分享资料中的可选信息，并可随时更改选择。",
    publicationStatus: "你已选择分享可选信息。",
    privateStatus: "你的可选资料信息为私密。",
    objectionStatus: "在我们审核隐私异议期间，你的游戏资料将限制公开。",
    publish: "分享可选信息",
    keepPrivate: "隐藏可选信息",
    saving: "正在保存…",
    saved: "已保存分享选择。",
    conflict: "分享选择已在另一会话中更改。请重新加载页面后再试。",
    unavailable: "无法更新分享选择。请重试或联系支持。",
    confirmationLabel: "我选择分享隐私政策所述的可选信息，例如不同的显示名称、国家、头像、符合条件的展示内容及非官方赛事快照。获授权的赛事数据集成也可能接收我已验证的 Relic 标识和资料链接。",
  },
  ru: {
    heading: "Дополнительные данные игрового профиля",
    description: "Игровой псевдоним, публичная ссылка на профиль, соревновательный регион или дивизион и текущий ELO могут быть открыты. Официальные записи турниров публикуются отдельно. Для Discord предусмотрена отдельная настройка.",
    newProfileDisclosure: "При создании профиля посетителям видны основные данные. Дополнительные сведения остаются закрытыми, пока вы не решите их опубликовать.",
    legacyDescription: "Вы можете выбрать, публиковать ли дополнительные сведения профиля. Этот выбор можно изменить.",
    publicationStatus: "Вы публикуете дополнительные сведения профиля.",
    privateStatus: "Дополнительные сведения профиля закрыты.",
    objectionStatus: "Доступ к игровому профилю ограничен, пока мы рассматриваем возражение по поводу конфиденциальности.",
    publish: "Опубликовать дополнительные сведения",
    keepPrivate: "Скрыть дополнительные сведения",
    saving: "Сохранение…",
    saved: "Выбор публикации сохранён.",
    conflict: "Выбор изменился в другом сеансе. Обновите страницу и повторите попытку.",
    unavailable: "Не удалось сохранить выбор. Повторите попытку или обратитесь в службу поддержки.",
    confirmationLabel: "Я выбираю публикацию дополнительных сведений, описанных в Политике конфиденциальности: отдельного отображаемого имени, страны, аватара, допустимых материалов витрины и неофициальных данных событий. Авторизованная интеграция также может получить мой проверенный идентификатор Relic и ссылку на профиль.",
  },
  es: {
    heading: "Datos opcionales del perfil de juego",
    description: "El nombre en el juego, el enlace público al perfil, la región competitiva o división y el ELO actual pueden ser públicos. Los registros oficiales de los torneos se publican por separado. Discord tiene su propio ajuste de visibilidad.",
    newProfileDisclosure: "Al crear el perfil, los visitantes pueden ver sus datos básicos. Los datos opcionales siguen siendo privados hasta que decidas compartirlos.",
    legacyDescription: "Puedes elegir si quieres compartir los datos opcionales de tu perfil y cambiar esa elección más adelante.",
    publicationStatus: "Compartes los datos opcionales de tu perfil.",
    privateStatus: "Los datos opcionales de tu perfil son privados.",
    objectionStatus: "Tu perfil de juego está restringido mientras revisamos una objeción de privacidad.",
    publish: "Compartir datos opcionales",
    keepPrivate: "Ocultar datos opcionales",
    saving: "Guardando…",
    saved: "Se guardó tu elección de uso compartido.",
    conflict: "Tu elección cambió en otra sesión. Vuelve a cargar la página e inténtalo de nuevo.",
    unavailable: "No se pudo actualizar tu elección. Inténtalo de nuevo o contacta con el servicio de asistencia.",
    confirmationLabel: "Elijo compartir los datos opcionales descritos en la Política de privacidad. Pueden incluir un nombre visible distinto, el país, el avatar, contenido destacado apto y datos no oficiales de eventos. La integración autorizada también puede recibir mi identificador de Relic verificado y el enlace a mi perfil.",
  },
  "pt-BR": {
    heading: "Dados opcionais do perfil de jogo",
    description: "O nome no jogo, o link público do perfil, a região competitiva ou divisão e o ELO atual podem ser públicos. Os registros oficiais de torneios são publicados separadamente. O Discord tem sua própria configuração de visibilidade.",
    newProfileDisclosure: "Ao criar um perfil, visitantes podem ver seus dados básicos. Os dados opcionais continuam privados até você escolher compartilhá-los.",
    legacyDescription: "Você pode escolher se quer compartilhar os dados opcionais do perfil e mudar essa escolha depois.",
    publicationStatus: "Você compartilha os dados opcionais do seu perfil.",
    privateStatus: "Os dados opcionais do seu perfil são privados.",
    objectionStatus: "Seu perfil de jogo fica restrito enquanto analisamos uma objeção de privacidade.",
    publish: "Compartilhar dados opcionais",
    keepPrivate: "Ocultar dados opcionais",
    saving: "Salvando…",
    saved: "Sua escolha de compartilhamento foi salva.",
    conflict: "Sua escolha mudou em outra sessão. Recarregue a página e tente novamente.",
    unavailable: "Não foi possível atualizar sua escolha. Tente novamente ou entre em contato com o suporte.",
    confirmationLabel: "Escolho compartilhar os dados opcionais descritos na Política de Privacidade. Eles podem incluir um nome de exibição diferente, país, avatar, conteúdo elegível da vitrine e dados não oficiais de eventos. A integração autorizada também pode receber meu identificador Relic verificado e o link do meu perfil.",
  },
  ko: {
    heading: "게임 프로필 선택 정보",
    description: "게임 내 이름, 공개 프로필 링크, 경쟁 지역 또는 디비전, 현재 ELO는 공개될 수 있습니다. 공식 대회 기록은 별도로 공개됩니다. Discord에는 별도의 공개 설정이 있습니다.",
    newProfileDisclosure: "프로필을 만들면 방문자가 기본 정보를 볼 수 있습니다. 선택 정보는 공유를 선택할 때까지 비공개입니다.",
    legacyDescription: "프로필의 선택 정보를 공유할지 정할 수 있으며 나중에 변경할 수 있습니다.",
    publicationStatus: "프로필의 선택 정보를 공유하고 있습니다.",
    privateStatus: "프로필의 선택 정보는 비공개입니다.",
    objectionStatus: "개인정보 공개에 대한 이의 제기를 검토하는 동안 게임 프로필의 공개가 제한됩니다.",
    publish: "선택 정보 공유",
    keepPrivate: "선택 정보 숨기기",
    saving: "저장 중…",
    saved: "공유 설정을 저장했습니다.",
    conflict: "다른 세션에서 공유 설정이 변경되었습니다. 페이지를 새로 고친 후 다시 시도하세요.",
    unavailable: "공유 설정을 변경하지 못했습니다. 다시 시도하거나 지원팀에 문의하세요.",
    confirmationLabel: "개인정보 처리방침에 설명된 선택 정보를 공유하겠습니다. 별도의 표시 이름, 국가, 아바타, 공개 요건을 충족한 쇼케이스 콘텐츠, 비공식 대회 정보가 포함될 수 있습니다. 승인된 대회 연동 서비스에는 검증된 Relic 식별자와 프로필 링크도 제공될 수 있습니다.",
  },
  fr: {
    heading: "Informations facultatives du profil de jeu",
    description: "Le nom en jeu, le lien public du profil, la région de compétition ou la division et l’ELO actuel peuvent être publics. Les archives officielles des tournois sont publiées séparément. Discord dispose de son propre réglage.",
    newProfileDisclosure: "À la création du profil, les visiteurs peuvent voir ses informations essentielles. Les informations facultatives restent privées tant que vous ne choisissez pas de les partager.",
    legacyDescription: "Vous pouvez choisir de partager les informations facultatives du profil et modifier ce choix plus tard.",
    publicationStatus: "Vous partagez les informations facultatives de votre profil.",
    privateStatus: "Les informations facultatives de votre profil sont privées.",
    objectionStatus: "L’accès à votre profil est limité pendant l’examen d’une opposition liée à la confidentialité.",
    publish: "Partager les informations facultatives",
    keepPrivate: "Masquer les informations facultatives",
    saving: "Enregistrement…",
    saved: "Votre choix de partage a été enregistré.",
    conflict: "Votre choix a changé dans une autre session. Rechargez la page et réessayez.",
    unavailable: "Votre choix n’a pas pu être modifié. Réessayez ou contactez l’assistance.",
    confirmationLabel: "Je choisis de partager les informations facultatives décrites dans la Politique de confidentialité. Elles peuvent inclure un nom d’affichage différent, le pays, l’avatar, les contenus admissibles de la vitrine et des données non officielles d’événements. L’intégration autorisée peut aussi recevoir mon identifiant Relic vérifié et le lien de mon profil.",
  },
} satisfies Record<Locale, GamingProfilePublicationCopy>;

export function getGamingProfilePublicationCopy(locale: Locale): GamingProfilePublicationCopy {
  return COPY[locale];
}
