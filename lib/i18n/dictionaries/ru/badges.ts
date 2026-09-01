import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "Коллекция значков | IronClad",
    pageDescription: "Просмотрите свою коллекцию значков IronClad.",
    artworkAlt: "Изображение значка «{name}»",
  },
  rarity: {
    common: "Обычный",
    uncommon: "Необычный",
    rare: "Редкий",
    epic: "Эпический",
    legendary: "Легендарный",
  },
  states: {
    earned: "Получен",
    locked: "Заблокирован",
    new: "Новый",
  },
  dashboard: {
    eyebrow: "Значки",
    title: "Коллекция значков IronClad",
    earnedWithBadges: "Здесь показаны ваши последние достижения IronClad.",
    empty:
      "Получайте значки за участие, победы и важные этапы в турнирах IronClad.",
    earnedLabel: "Получено",
    viewCollection: "Открыть коллекцию значков",
    inspect: "Откройте полную коллекцию, чтобы увидеть полученные и заблокированные значки.",
    explore: "Изучите все значки и условия их получения.",
    featuredAria: "Избранные значки на панели",
    progressAria: "Получено значков: {earned} из {total}",
    loadErrorTitle: "Коллекция значков недоступна",
    loadErrorDescription:
      "Не удалось загрузить коллекцию. Ваши полученные значки сохранены.",
    retry: "Повторить",
  },
  collection: {
    back: "Вернуться на панель",
    eyebrow: "Архив достижений",
    title: "Коллекция значков",
    description:
      "Просмотрите все значки IronClad, их редкость и условия получения.",
    earnedLabel: "Получено",
    showing: "Показано значков: {shown} из {total}",
    filters: {
      all: "Все",
      earned: "Полученные",
      locked: "Заблокированные",
    },
    filtersAria: "Фильтры коллекции значков",
    slotsAria: "Ячейки коллекции значков IronClad",
    empty: "Нет значков, соответствующих этому фильтру.",
  },
  detail: {
    eyebrow: "Достижение IronClad",
    badgeNumber: "Значок {number}",
    unlockMeaning: "Условие получения",
    status: "Статус",
    originalAwarded: "Впервые получен",
    close: "Закрыть сведения о значке",
    dismiss: "Скрыть сведения о значке",
  },
  reveal: {
    unlocked: "Значок открыт",
    continue: "Завершить открытие",
    notNow: "Не сейчас",
    saving: "Сохранение открытия…",
    queuePosition: "Значок {current} из {total}",
    ackError:
      "Не удалось сохранить открытие значка. Проверьте подключение и повторите попытку.",
    retry: "Повторить подтверждение",
    transferUnavailable:
      "Ячейка коллекции переместилась. Открытие завершится без перемещения.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "Новобранец IronClad",
      unlockMeaning:
        "Пройдите проверку личности и ELO и станьте допущенным игроком IronClad.",
    },
    "first-deployment": {
      name: "Первое развёртывание",
      unlockMeaning: "Завершите свой первый официальный матч IronClad.",
    },
    "first-victory": {
      name: "Первая победа",
      unlockMeaning: "Выиграйте свой первый официальный матч IronClad.",
    },
    "battle-tested": {
      name: "Закалённый в бою",
      unlockMeaning: "Завершите 10 официальных матчей IronClad.",
    },
    "rising-through-the-ranks": {
      name: "Вверх по рангам",
      unlockMeaning:
        "Завершите зачётный турнир в дивизионе выше первого дивизиона, в котором вы завершили турнир IronClad.",
    },
    "first-campaign": {
      name: "Первая кампания",
      unlockMeaning: "Завершите свой первый полный турнир IronClad.",
    },
    "iron-regular": {
      name: "Железный завсегдатай",
      unlockMeaning: "Завершите 3 турнира IronClad.",
    },
    "tournament-veteran": {
      name: "Ветеран турниров",
      unlockMeaning: "Завершите 10 турниров IronClad.",
    },
    "season-campaigner": {
      name: "Участник сезона",
      unlockMeaning:
        "Завершите не менее 4 зачётных турниров в одном финализированном сезоне IronClad.",
    },
    "reliable-competitor": {
      name: "Надёжный участник",
      unlockMeaning:
        "Завершите 10 назначенных участий без подтверждённой неявки по вашей вине или двойной неявки.",
    },
    "five-victories": {
      name: "Пять побед",
      unlockMeaning: "Выиграйте 5 официальных матчей IronClad.",
    },
    "ten-victories": {
      name: "Десять побед",
      unlockMeaning: "Выиграйте 10 официальных матчей IronClad.",
    },
    "twenty-five-victories": {
      name: "Двадцать пять побед",
      unlockMeaning: "Выиграйте 25 официальных матчей IronClad.",
    },
    "iron-streak": {
      name: "Железная серия",
      unlockMeaning: "Выиграйте 3 сыгранных официальных матча подряд.",
    },
    unbroken: {
      name: "Несокрушимый",
      unlockMeaning: "Выиграйте 5 сыгранных официальных матчей подряд.",
    },
    "clean-sweep": {
      name: "Сухая победа",
      unlockMeaning: "Выиграйте BO3 со счётом 2–0 или BO5 со счётом 3–0.",
    },
    "comeback-commander": {
      name: "Командир камбэка",
      unlockMeaning: "Проиграйте первую игру, а затем выиграйте официальную серию.",
    },
    "giant-slayer": {
      name: "Победитель гигантов",
      unlockMeaning:
        "Победите соперника, чей подтверждённый турнирный ELO выше вашего не менее чем на 200 очков.",
    },
    "giant-hunter": {
      name: "Охотник на гигантов",
      unlockMeaning: "Получите достижение «Победитель гигантов» 3 разных раза.",
    },
    "flawless-campaign": {
      name: "Безупречная кампания",
      unlockMeaning:
        "Выиграйте турнир IronClad, сыграв хотя бы одну официальную серию и не проиграв ни одной отдельной игры.",
    },
    "first-advance": {
      name: "Первое продвижение",
      unlockMeaning: "Выиграйте свой первый сыгранный раунд турнирной сетки.",
    },
    semifinalist: {
      name: "Полуфиналист",
      unlockMeaning: "Дойдите до официального полуфинала турнира IronClad.",
    },
    finalist: {
      name: "Финалист",
      unlockMeaning: "Дойдите до официального финала турнира IronClad.",
    },
    "academy-champion": {
      name: "Чемпион Academy",
      unlockMeaning: "Выиграйте официальный турнир дивизиона Academy.",
    },
    "challenge-champion": {
      name: "Чемпион Challenge",
      unlockMeaning: "Выиграйте официальный турнир дивизиона Challenge.",
    },
    "elite-champion": {
      name: "Чемпион Elite",
      unlockMeaning: "Выиграйте официальный турнир дивизиона Main/Elite.",
    },
    "double-champion": {
      name: "Двукратный чемпион",
      unlockMeaning: "Выиграйте 2 разных турнира IronClad.",
    },
    "triple-crown": {
      name: "Тройная корона",
      unlockMeaning:
        "Хотя бы по одному разу выиграйте турниры дивизионов Academy, Challenge и Main/Elite.",
    },
    "season-podium": {
      name: "Подиум сезона",
      unlockMeaning: "Завершите финализированный официальный сезон в тройке лучших.",
    },
    "season-champion": {
      name: "Чемпион сезона",
      unlockMeaning: "Займите 1-е место в финализированной официальной таблице сезона.",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
