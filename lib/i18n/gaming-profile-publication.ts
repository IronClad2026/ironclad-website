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
    heading: "Gaming profile visibility",
    description: "Visitors can see public gaming profiles without signing in. Official tournament participation, results and standings are published separately. Discord has its own visibility setting.",
    newProfileDisclosure: "When you create your gaming profile, visitors will be able to see it. You can choose separately whether to show your Discord contact.",
    legacyDescription: "Your account can keep its earlier visibility. You can choose to publish your gaming profile or make it private again.",
    publicationStatus: "Your gaming profile is public.",
    privateStatus: "Your full gaming profile is private.",
    objectionStatus: "Your full gaming profile is restricted while we review a privacy objection.",
    publish: "Publish my gaming profile",
    keepPrivate: "Make my gaming profile private",
    saving: "Saving…",
    saved: "Your profile visibility was saved.",
    conflict: "Your visibility changed in another session. Reload this page and try again.",
    unavailable: "Your profile visibility could not be updated. Try again or contact support.",
    confirmationLabel: "I choose to publish my gaming profile as described in the Privacy Policy, including my display and in-game names, country, competitive region, rating, avatar and any Showcase content I publish.",
  },
  it: {
    heading: "Visibilità del profilo di gioco",
    description: "Chiunque può vedere i profili pubblici senza accedere. Partecipazione ai tornei, risultati e classifiche ufficiali sono pubblicati separatamente. Discord ha una propria impostazione di visibilità.",
    newProfileDisclosure: "Quando crei il tuo profilo di gioco, chiunque potrà vederlo. Puoi scegliere separatamente se mostrare il tuo contatto Discord.",
    legacyDescription: "Il tuo account può mantenere la visibilità precedente. Puoi scegliere di pubblicare il profilo o renderlo di nuovo privato.",
    publicationStatus: "Il tuo profilo di gioco è pubblico.",
    privateStatus: "Il tuo profilo di gioco completo è privato.",
    objectionStatus: "L’accesso al tuo profilo completo è limitato mentre esaminiamo un’opposizione per motivi di privacy.",
    publish: "Pubblica il mio profilo di gioco",
    keepPrivate: "Rendi privato il mio profilo di gioco",
    saving: "Salvataggio in corso…",
    saved: "La visibilità del profilo è stata salvata.",
    conflict: "La visibilità è cambiata in un’altra sessione. Ricarica la pagina e riprova.",
    unavailable: "Non è stato possibile aggiornare la visibilità del profilo. Riprova o contatta l’assistenza.",
    confirmationLabel: "Scelgo di pubblicare il mio profilo di gioco come descritto nell’informativa sulla privacy, inclusi nome visualizzato, nome di gioco, paese, regione competitiva, punteggio, avatar e contenuti che pubblico nella vetrina.",
  },
  "zh-CN": {
    heading: "游戏资料可见性",
    description: "访客无需登录即可查看公开游戏资料。官方赛事的参赛情况、赛果和排名会单独公布。Discord 有独立的可见性设置。",
    newProfileDisclosure: "创建游戏资料后，访客即可查看。是否显示 Discord 联系方式可单独选择。",
    legacyDescription: "你的账号可以保留原有的可见性安排。你可以选择公开游戏资料，也可以重新设为私密。",
    publicationStatus: "你的游戏资料已公开。",
    privateStatus: "你的完整游戏资料为私密。",
    objectionStatus: "在我们处理隐私异议期间，你的完整游戏资料将限制公开。",
    publish: "公开我的游戏资料",
    keepPrivate: "将我的游戏资料设为私密",
    saving: "正在保存…",
    saved: "已保存资料的可见性设置。",
    conflict: "可见性已在另一会话中更改。请重新加载页面后再试。",
    unavailable: "无法更新资料的可见性。请重试或联系支持。",
    confirmationLabel: "我选择按照隐私政策所述公开我的游戏资料，包括显示名称、游戏内名称、国家、竞技赛区、评分、头像以及我发布的展示内容。",
  },
  ru: {
    heading: "Видимость игрового профиля",
    description: "Публичные игровые профили доступны без входа в аккаунт. Сведения об участии в турнирах, официальные результаты и таблицы публикуются отдельно. Для Discord предусмотрена отдельная настройка видимости.",
    newProfileDisclosure: "Когда вы создадите игровой профиль, посетители смогут его видеть. Вы можете отдельно выбрать, показывать ли ваш контакт в Discord.",
    legacyDescription: "Ваш аккаунт может сохранить прежнюю видимость. Вы можете опубликовать игровой профиль или снова сделать его закрытым.",
    publicationStatus: "Ваш игровой профиль является публичным.",
    privateStatus: "Ваш полный игровой профиль закрыт.",
    objectionStatus: "Доступ к полному игровому профилю ограничен, пока мы рассматриваем возражение по поводу конфиденциальности.",
    publish: "Опубликовать мой игровой профиль",
    keepPrivate: "Сделать мой игровой профиль закрытым",
    saving: "Сохранение…",
    saved: "Настройка видимости профиля сохранена.",
    conflict: "Видимость изменилась в другом сеансе. Обновите страницу и повторите попытку.",
    unavailable: "Не удалось изменить видимость профиля. Повторите попытку или обратитесь в службу поддержки.",
    confirmationLabel: "Я выбираю публикацию своего игрового профиля в соответствии с Политикой конфиденциальности, включая имя, игровой псевдоним, страну, соревновательный регион, рейтинг, аватар и материалы, которые я публикую в витрине.",
  },
  es: {
    heading: "Visibilidad del perfil de juego",
    description: "Los visitantes pueden ver los perfiles públicos sin iniciar sesión. La participación en torneos, los resultados y las clasificaciones oficiales se publican por separado. Discord tiene su propio ajuste de visibilidad.",
    newProfileDisclosure: "Cuando crees tu perfil de juego, los visitantes podrán verlo. Puedes decidir por separado si muestras tu contacto de Discord.",
    legacyDescription: "Tu cuenta puede mantener la visibilidad anterior. Puedes publicar tu perfil de juego o volver a hacerlo privado.",
    publicationStatus: "Tu perfil de juego es público.",
    privateStatus: "Tu perfil de juego completo es privado.",
    objectionStatus: "Tu perfil completo está restringido mientras revisamos una objeción de privacidad.",
    publish: "Publicar mi perfil de juego",
    keepPrivate: "Hacer privado mi perfil de juego",
    saving: "Guardando…",
    saved: "Se guardó la visibilidad de tu perfil.",
    conflict: "La visibilidad cambió en otra sesión. Vuelve a cargar la página e inténtalo de nuevo.",
    unavailable: "No se pudo actualizar la visibilidad de tu perfil. Inténtalo de nuevo o ponte en contacto con el servicio de asistencia.",
    confirmationLabel: "Elijo publicar mi perfil de juego según lo descrito en la Política de privacidad, incluidos el nombre visible, el nombre en el juego, el país, la región competitiva, la puntuación, el avatar y el contenido que publique en la sección de destacados.",
  },
  "pt-BR": {
    heading: "Visibilidade do perfil de jogo",
    description: "Visitantes podem ver perfis públicos sem fazer login. A participação em torneios, os resultados e as tabelas oficiais são publicados separadamente. O Discord tem uma configuração de visibilidade própria.",
    newProfileDisclosure: "Quando você criar seu perfil de jogo, visitantes poderão vê-lo. Você pode escolher separadamente se quer mostrar seu contato do Discord.",
    legacyDescription: "Sua conta pode manter a visibilidade anterior. Você pode publicar seu perfil de jogo ou torná-lo privado novamente.",
    publicationStatus: "Seu perfil de jogo é público.",
    privateStatus: "Seu perfil de jogo completo é privado.",
    objectionStatus: "Seu perfil de jogo completo fica restrito enquanto analisamos uma objeção de privacidade.",
    publish: "Publicar meu perfil de jogo",
    keepPrivate: "Tornar meu perfil de jogo privado",
    saving: "Salvando…",
    saved: "A visibilidade do seu perfil foi salva.",
    conflict: "A visibilidade mudou em outra sessão. Recarregue a página e tente novamente.",
    unavailable: "Não foi possível atualizar a visibilidade do perfil. Tente novamente ou entre em contato com o suporte.",
    confirmationLabel: "Escolho publicar meu perfil de jogo conforme descrito na Política de Privacidade, incluindo nome de exibição, nome no jogo, país, região competitiva, classificação, avatar e qualquer conteúdo que eu publique na vitrine.",
  },
  ko: {
    heading: "게임 프로필 공개 범위",
    description: "방문자는 로그인하지 않고 공개 프로필을 볼 수 있습니다. 대회 참가 내역, 결과 및 공식 순위는 별도로 공개됩니다. Discord에는 별도의 공개 설정이 있습니다.",
    newProfileDisclosure: "게임 프로필을 만들면 방문자가 볼 수 있습니다. Discord 연락처를 표시할지는 별도로 선택할 수 있습니다.",
    legacyDescription: "계정의 기존 공개 범위를 유지할 수 있습니다. 게임 프로필을 공개하거나 다시 비공개로 전환할 수 있습니다.",
    publicationStatus: "게임 프로필이 공개되어 있습니다.",
    privateStatus: "전체 게임 프로필이 비공개 상태입니다.",
    objectionStatus: "개인정보 공개에 대한 이의 제기를 검토하는 동안 전체 게임 프로필의 공개가 제한됩니다.",
    publish: "내 게임 프로필 공개",
    keepPrivate: "내 게임 프로필을 비공개로 전환",
    saving: "저장 중…",
    saved: "프로필 공개 설정을 저장했습니다.",
    conflict: "다른 세션에서 공개 설정이 변경되었습니다. 페이지를 새로 고친 후 다시 시도하세요.",
    unavailable: "프로필 공개 설정을 변경하지 못했습니다. 다시 시도하거나 지원팀에 문의하세요.",
    confirmationLabel: "개인정보 처리방침에 따라 표시 이름, 게임 내 이름, 국가, 경쟁 지역, 레이팅, 아바타 및 내가 공개한 쇼케이스 콘텐츠를 포함한 내 게임 프로필을 공개하겠습니다.",
  },
  fr: {
    heading: "Visibilité du profil de jeu",
    description: "Les visiteurs peuvent consulter les profils publics sans se connecter. La participation aux tournois, les résultats et les classements officiels sont publiés séparément. Discord dispose de son propre réglage de visibilité.",
    newProfileDisclosure: "Lorsque vous créerez votre profil de jeu, les visiteurs pourront le voir. Vous pouvez choisir séparément d’afficher ou non votre contact Discord.",
    legacyDescription: "Votre compte peut conserver sa visibilité antérieure. Vous pouvez publier votre profil de jeu ou le rendre à nouveau privé.",
    publicationStatus: "Votre profil de jeu est public.",
    privateStatus: "Votre profil de jeu complet est privé.",
    objectionStatus: "L’accès à votre profil complet est limité pendant l’examen d’une opposition liée à la confidentialité.",
    publish: "Publier mon profil de jeu",
    keepPrivate: "Rendre mon profil de jeu privé",
    saving: "Enregistrement…",
    saved: "La visibilité de votre profil a été enregistrée.",
    conflict: "La visibilité a changé dans une autre session. Rechargez la page et réessayez.",
    unavailable: "La visibilité du profil n’a pas pu être modifiée. Réessayez ou contactez l’assistance.",
    confirmationLabel: "Je choisis de publier mon profil de jeu comme décrit dans la Politique de confidentialité, y compris mon nom d’affichage, mon nom en jeu, mon pays, ma région de compétition, ma cote, mon avatar et les contenus que je publie dans ma vitrine.",
  },
} satisfies Record<Locale, GamingProfilePublicationCopy>;

export function getGamingProfilePublicationCopy(locale: Locale): GamingProfilePublicationCopy {
  return COPY[locale];
}
