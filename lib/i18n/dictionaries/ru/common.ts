import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "Главная",
    tournaments: "Турниры",
    players: "Игроки",
    rules: "Правила",
    leaderboardAndRankings: "Таблица лидеров и рейтинг",
    about: "О проекте",
    dashboard: "Панель игрока",
    admin: "Администрирование",
    primaryNavigation: "Основная навигация",
    mobileNavigation: "Мобильная навигация",
    openMenu: "Открыть меню навигации",
    closeMenu: "Закрыть меню навигации",
  },
  footer: {
    copyright: "© {year} IronClad. Все права защищены.",
    legalAndRules: "Правовые документы и правила",
    rules: "Правила",
    rulebook: "Свод правил",
    participationAgreement: "Соглашение об участии игрока",
    participationAgreementShort: "PPA",
    terms: "Условия использования",
    privacy: "Политика конфиденциальности",
    opensInNewTab: "{label} (откроется в новой вкладке)",
  },
  actions: {
    loading: "Загрузка…",
    retry: "Повторить",
    close: "Закрыть",
    cancel: "Отмена",
    back: "Назад",
    save: "Сохранить",
    continue: "Продолжить",
    success: "Успешно",
    error: "Ошибка",
  },
  analyticsConsent: {
    label: "Настройки аналитики",
    title: "Помогите улучшить IronClad",
    description:
      "Необязательная аналитика помогает нам понимать посещаемость и использование страниц. Она загружается только с вашего разрешения.",
    details:
      "Если аналитика включена, Vercel может получать путь публичной страницы, источник перехода, примерную страну, тип устройства, браузер и операционную систему. IronClad не использует аналитические cookie-файлы, рекламу или запись сеансов.",
    required:
      "Необходимые функции аутентификации и безопасности не зависят от этого выбора.",
    allow: "Разрешить аналитику",
    decline: "Отклонить",
    privacyLink: "Прочитать Политику конфиденциальности",
    choices: "Параметры аналитики",
    dialogTitle: "Настройки аналитики",
    dialogDescription:
      "Вы можете в любое время изменить выбор для этого браузера. Отзыв разрешения остановит сбор аналитических данных в будущем.",
    close: "Закрыть настройки аналитики",
    currentChoice: "Текущий выбор",
    statusGranted: "Аналитика разрешена",
    statusDeclined: "Аналитика выключена",
    statusUndecided: "Выбор не сохранён",
    withdraw: "Отозвать разрешение на аналитику",
    saveError:
      "Не удалось сохранить ваш выбор. В этой вкладке аналитика отключена, но изменение может не сохраниться. Проверьте настройки хранилища браузера и повторите попытку.",
    savedGranted: "Аналитика разрешена.",
    savedDeclined: "Аналитика остаётся выключенной.",
  },
  legalUpdate: {
    eyebrow: "Важное обновление юридических документов",
    title: "Ознакомьтесь с обновлёнными условиями и примите их",
    description:
      "Чтобы продолжить пользоваться функциями IronClad после входа, ознакомьтесь с Terms of Service v{termsVersion} и примите их, а также подтвердите ознакомление с Privacy Policy v{privacyVersion}. Аналитика остаётся необязательной и настраивается отдельно.",
    termsLinkLabel: "Открыть Terms of Service",
    privacyLinkLabel: "Открыть Privacy Policy",
    termsAgreement: "Я принимаю Terms of Service v{termsVersion}.",
    privacyAcknowledgement:
      "Я подтверждаю ознакомление с Privacy Policy v{privacyVersion}.",
    continueAction: "Принять и продолжить",
    savingAction: "Сохранение принятия…",
    signOutAction: "Выйти",
    retryAction: "Повторить попытку",
    unavailableTitle:
      "Обновление юридических документов временно недоступно",
    unavailableDescription:
      "IronClad сейчас не может проверить действующие юридические документы. Принятие не было зарегистрировано. Повторите попытку или выйдите из аккаунта.",
    authRequiredError: "Войдите снова, чтобы продолжить.",
    acceptanceRequiredError:
      "Необходимо отметить оба юридических подтверждения.",
    unavailableError:
      "IronClad не удалось зарегистрировать ваше принятие. Ничего не сохранено. Повторите попытку.",
    acceptedMessage: "Принятие зарегистрировано. IronClad загружается…",
  },
  selector: {
    language: "Язык",
    triggerAriaLabel: "Выбрать язык. Текущий язык: {language}",
    languageRowLabel: "Язык",
    title: "Выберите язык",
    description: "Выберите язык интерфейса игрока IronClad.",
    closeLabel: "Закрыть выбор языка",
    selectedLabel: "Выбрано",
    savingLabel: "Сохранение языка…",
    saveError: "Не удалось сохранить языковые настройки. Попробуйте ещё раз.",
    translationReviewNotice:
      "Переводы предоставлены для удобства и были тщательно проверены, однако их мог не проверять носитель языка. Исходным языком остаётся английский.",
    privacyHeading: "Языковые настройки",
    privacyCookie:
      "IronClad сохраняет ваш явный выбор в функциональном cookie-файле первой стороны на срок примерно до одного года.",
    privacyClerk:
      "Если вы вошли в систему, выбор также может храниться в закрытых метаданных Clerk, чтобы транзакционные письма самого IronClad приходили на выбранном языке.",
    privacyNoTracking:
      "Эта настройка не используется для рекламы или межсайтового отслеживания.",
    privacyNotEvidence:
      "Эта настройка не является доказательством местоположения, юрисдикции, согласия или понимания.",
    privacyChange: "Вы можете изменить настройку здесь в любое время.",
    privacyPolicyLink: "Прочитать Политику конфиденциальности",
  },
  install: {
    mobile: "IronClad для мобильных", title: "Установить IronClad", close: "Закрыть инструкции по установке", description: "Добавьте IronClad на главный экран для быстрого доступа и полноэкранного режима приложения.", now: "Установить", promptHelp: "Браузер откроет защищённое окно установки.", iosMenuTitle: "Откройте меню", iosMenuText: "Нажмите кнопку ⋯ («Ещё») в Safari.", shareTitle: "Поделиться", shareText: "Нажмите «Поделиться».", homeTitle: "На экран «Домой»", homeText: "Выберите «На экран “Домой”». Если пункта нет, нажмите «Ещё» и найдите его в списке.", addTitle: "Установить", addText: "Нажмите «Добавить».", browserMenuTitle: "Откройте меню браузера", browserMenuText: "Нажмите кнопку меню в Chrome, Edge или другом браузере.", appTitle: "Установите приложение", appText: "Выберите «Установить приложение» или «Добавить на главный экран».", confirmTitle: "Подтвердите", confirmText: "Подтвердите установку при появлении запроса.", download: "Скачать приложение", step: "Шаг {number}",
  },
  music: { playerLabel: "Проигрыватель темы IronClad", pause: "Приостановить тему IronClad", play: "Воспроизвести тему IronClad", unavailable: "Музыка недоступна" },
  legal: {
    effectiveEnglishNotice:
      "Действующий текст, имеющий обязательную силу, составлен на английском языке. Официального перевода пока нет.",
    read: "Читать",
    download: "Скачать",
    continueInEnglish: "Продолжить на английском",
    goBack: "Назад",
  },
  errors: {
    notFoundEyebrow: "404 · Не найдено",
    notFoundTitle: "Страница не найдена.",
    notFoundDescription: "Возможно, ссылка устарела или страница была перемещена.",
    returnHome: "На главную",
    unexpectedTitle: "Произошла ошибка.",
    unexpectedDescription:
      "IronClad не удалось загрузить интерфейс игрока. Попробуйте ещё раз.",
    retry: "Попробовать снова",
    loading: "Загрузка…",
  },
} satisfies CommonDictionary;

export default dictionary;
