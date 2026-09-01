import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "Colección de insignias | IronClad",
    pageDescription: "Consulta tu colección de insignias de IronClad.",
    artworkAlt: "Ilustración de la insignia {name}",
  },
  rarity: {
    common: "Común",
    uncommon: "Poco común",
    rare: "Rara",
    epic: "Épica",
    legendary: "Legendaria",
  },
  states: {
    earned: "Conseguida",
    locked: "Bloqueada",
    new: "Nueva",
  },
  dashboard: {
    eyebrow: "Insignias",
    title: "Colección de insignias de IronClad",
    earnedWithBadges: "Aquí se muestran tus logros más recientes de IronClad.",
    empty:
      "Consigue insignias compitiendo, ganando y alcanzando hitos en los torneos de IronClad.",
    earnedLabel: "Conseguidas",
    viewCollection: "Ver colección de insignias",
    inspect: "Abre la colección completa para consultar todas las insignias conseguidas y bloqueadas.",
    explore: "Explora todas las insignias y descubre cómo desbloquearlas.",
    featuredAria: "Insignias destacadas del panel",
    progressAria: "{earned} de {total} insignias conseguidas",
    loadErrorTitle: "Colección de insignias no disponible",
    loadErrorDescription:
      "No se pudo cargar tu colección. Las insignias que has conseguido están a salvo.",
    retry: "Reintentar",
  },
  collection: {
    back: "Volver al panel",
    eyebrow: "Archivo de logros",
    title: "Colección de insignias",
    description:
      "Consulta cada insignia de IronClad, su rareza y el logro necesario para conseguirla.",
    earnedLabel: "Conseguidas",
    showing: "Mostrando {shown} de {total} insignias",
    filters: {
      all: "Todas",
      earned: "Conseguidas",
      locked: "Bloqueadas",
    },
    filtersAria: "Filtros de la colección de insignias",
    slotsAria: "Espacios de la colección de insignias de IronClad",
    empty: "Ninguna insignia coincide con este filtro.",
  },
  detail: {
    eyebrow: "Logro de IronClad",
    badgeNumber: "Insignia {number}",
    unlockMeaning: "Requisito de desbloqueo",
    status: "Estado",
    originalAwarded: "Conseguida originalmente",
    close: "Cerrar detalles de la insignia",
    dismiss: "Descartar detalles de la insignia",
  },
  reveal: {
    unlocked: "Insignia desbloqueada",
    continue: "Completar revelación",
    notNow: "Ahora no",
    saving: "Guardando revelación…",
    queuePosition: "Insignia {current} de {total}",
    ackError:
      "No se guardó la revelación de tu insignia. Comprueba la conexión y vuelve a intentarlo.",
    retry: "Reintentar confirmación",
    transferUnavailable:
      "El espacio de la colección se ha movido. La revelación terminará sin movimiento.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "Recluta de IronClad",
      unlockMeaning:
        "Completa la verificación de identidad y ELO y conviértete en un jugador apto de IronClad.",
    },
    "first-deployment": {
      name: "Primer despliegue",
      unlockMeaning: "Completa tu primera partida oficial de IronClad.",
    },
    "first-victory": {
      name: "Primera victoria",
      unlockMeaning: "Gana tu primera partida oficial de IronClad.",
    },
    "battle-tested": {
      name: "Curtido en batalla",
      unlockMeaning: "Completa 10 partidas oficiales de IronClad.",
    },
    "rising-through-the-ranks": {
      name: "Ascenso en las filas",
      unlockMeaning:
        "Completa un torneo válido en una división superior a la primera división en la que completaste un torneo de IronClad.",
    },
    "first-campaign": {
      name: "Primera campaña",
      unlockMeaning: "Completa tu primer torneo completo de IronClad.",
    },
    "iron-regular": {
      name: "Habitual de hierro",
      unlockMeaning: "Completa 3 torneos de IronClad.",
    },
    "tournament-veteran": {
      name: "Veterano de torneos",
      unlockMeaning: "Completa 10 torneos de IronClad.",
    },
    "season-campaigner": {
      name: "Combatiente de temporada",
      unlockMeaning:
        "Completa al menos 4 torneos válidos en una temporada finalizada de IronClad.",
    },
    "reliable-competitor": {
      name: "Competidor fiable",
      unlockMeaning:
        "Completa 10 participaciones programadas sin una incomparecencia confirmada causada por ti ni una doble incomparecencia.",
    },
    "five-victories": {
      name: "Cinco victorias",
      unlockMeaning: "Gana 5 partidas oficiales de IronClad.",
    },
    "ten-victories": {
      name: "Diez victorias",
      unlockMeaning: "Gana 10 partidas oficiales de IronClad.",
    },
    "twenty-five-victories": {
      name: "Veinticinco victorias",
      unlockMeaning: "Gana 25 partidas oficiales de IronClad.",
    },
    "iron-streak": {
      name: "Racha de hierro",
      unlockMeaning: "Gana 3 partidas oficiales jugadas consecutivas.",
    },
    unbroken: {
      name: "Inquebrantable",
      unlockMeaning: "Gana 5 partidas oficiales jugadas consecutivas.",
    },
    "clean-sweep": {
      name: "Victoria perfecta",
      unlockMeaning: "Gana un BO3 por 2–0 o un BO5 por 3–0.",
    },
    "comeback-commander": {
      name: "Comandante de la remontada",
      unlockMeaning: "Pierde la primera partida y después gana la serie oficial.",
    },
    "giant-slayer": {
      name: "Matagigantes",
      unlockMeaning:
        "Derrota a un rival cuyo ELO verificado para el torneo sea al menos 200 puntos superior.",
    },
    "giant-hunter": {
      name: "Cazagigantes",
      unlockMeaning: "Consigue el logro Matagigantes en 3 ocasiones distintas.",
    },
    "flawless-campaign": {
      name: "Campaña impecable",
      unlockMeaning:
        "Gana un torneo de IronClad tras jugar al menos una serie oficial sin perder ninguna partida individual.",
    },
    "first-advance": {
      name: "Primer avance",
      unlockMeaning: "Gana tu primera ronda jugada del cuadro de un torneo.",
    },
    semifinalist: {
      name: "Semifinalista",
      unlockMeaning: "Llega a una semifinal oficial de un torneo de IronClad.",
    },
    finalist: {
      name: "Finalista",
      unlockMeaning: "Llega a una final oficial de un torneo de IronClad.",
    },
    "academy-champion": {
      name: "Campeón de Academia",
      unlockMeaning: "Gana un torneo oficial de la división Academy.",
    },
    "challenge-champion": {
      name: "Campeón de Desafío",
      unlockMeaning: "Gana un torneo oficial de la división Challenge.",
    },
    "elite-champion": {
      name: "Campeón de Élite",
      unlockMeaning: "Gana un torneo oficial de la división Main/Elite.",
    },
    "double-champion": {
      name: "Doble campeón",
      unlockMeaning: "Gana 2 torneos distintos de IronClad.",
    },
    "triple-crown": {
      name: "Triple corona",
      unlockMeaning:
        "Gana al menos una vez torneos de las divisiones Academy, Challenge y Main/Elite.",
    },
    "season-podium": {
      name: "Podio de temporada",
      unlockMeaning: "Termina una temporada oficial finalizada entre los 3 primeros.",
    },
    "season-champion": {
      name: "Campeón de temporada",
      unlockMeaning: "Termina 1.º en la clasificación oficial de una temporada finalizada.",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
