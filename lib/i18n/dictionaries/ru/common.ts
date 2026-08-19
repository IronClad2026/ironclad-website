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
    privacyHeading: "Языковые настройки",
    privacyCookie:
      "IronClad сохраняет ваш явный выбор в функциональном cookie-файле первой стороны на срок примерно до одного года.",
    privacyClerk:
      "Если вы вошли в систему, выбор также может храниться в закрытых метаданных Clerk, чтобы собственные транзакционные письма IronClad отправлялись на нужном языке.",
    privacyNoTracking:
      "Эта настройка не используется для рекламы или межсайтового отслеживания.",
    privacyNotEvidence:
      "Она не подтверждает ваше местоположение, юрисдикцию, согласие или понимание.",
    privacyChange: "Вы можете изменить настройку здесь в любое время.",
    privacyPolicyLink: "Прочитать Политику конфиденциальности",
  },
  install: {
    mobile: "IronClad для мобильных", title: "Установить IronClad", close: "Закрыть инструкции по установке", description: "Добавьте IronClad на главный экран для быстрого доступа и полноэкранного режима приложения.", now: "Установить", promptHelp: "Браузер откроет защищённое окно установки.", iosMenuTitle: "Откройте меню", iosMenuText: "Нажмите кнопку ⋯ («Ещё») в Safari.", shareTitle: "Поделиться", shareText: "Нажмите «Поделиться».", homeTitle: "На экран «Домой»", homeText: "Выберите «На экран “Домой”». Если пункта нет, нажмите «Ещё» и найдите его в списке.", addTitle: "Установить", addText: "Нажмите «Добавить».", browserMenuTitle: "Откройте меню браузера", browserMenuText: "Нажмите кнопку меню в Chrome, Edge или другом браузере.", appTitle: "Установите приложение", appText: "Выберите «Установить приложение» или «Добавить на главный экран».", confirmTitle: "Подтвердите", confirmText: "Подтвердите установку при появлении запроса.", download: "Скачать приложение", step: "Шаг {number}",
  },
  music: { playerLabel: "Проигрыватель темы IronClad", pause: "Приостановить тему IronClad", play: "Воспроизвести тему IronClad", unavailable: "Музыка недоступна" },
  legal: {
    effectiveEnglishNotice:
      "Действующий регулирующий текст составлен на английском языке. Официального перевода пока нет.",
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
