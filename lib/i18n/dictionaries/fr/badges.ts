import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "Collection de badges | IronClad",
    pageDescription: "Consultez votre collection de badges IronClad.",
    artworkAlt: "Illustration du badge {name}",
  },
  rarity: {
    common: "Commun",
    uncommon: "Peu commun",
    rare: "Rare",
    epic: "Épique",
    legendary: "Légendaire",
  },
  states: {
    earned: "Obtenu",
    locked: "Verrouillé",
    new: "Nouveau",
  },
  dashboard: {
    eyebrow: "Badges",
    title: "Collection de badges IronClad",
    earnedWithBadges: "Vos derniers accomplissements IronClad sont affichés ici.",
    empty:
      "Obtenez des badges en participant, en gagnant et en franchissant des étapes dans les tournois IronClad.",
    earnedLabel: "Obtenus",
    viewCollection: "Voir la collection de badges",
    inspect: "Ouvrez la collection complète pour consulter tous les badges obtenus et verrouillés.",
    explore: "Explorez chaque badge et découvrez comment le débloquer.",
    featuredAria: "Badges en vedette du tableau de bord",
    progressAria: "{earned} badges obtenus sur {total}",
    loadErrorTitle: "Collection de badges indisponible",
    loadErrorDescription:
      "Votre collection n'a pas pu être chargée. Vos badges obtenus sont en sécurité.",
    retry: "Réessayer",
  },
  collection: {
    back: "Retour au tableau de bord",
    eyebrow: "Archives des accomplissements",
    title: "Collection de badges",
    description:
      "Consultez chaque badge IronClad, sa rareté et l'accomplissement nécessaire pour l'obtenir.",
    earnedLabel: "Obtenus",
    showing: "Affichage de {shown} badges sur {total}",
    filters: {
      all: "Tous",
      earned: "Obtenus",
      locked: "Verrouillés",
    },
    filtersAria: "Filtres de la collection de badges",
    slotsAria: "Emplacements de la collection de badges IronClad",
    empty: "Aucun badge ne correspond à ce filtre.",
  },
  detail: {
    eyebrow: "Accomplissement IronClad",
    badgeNumber: "Badge {number}",
    unlockMeaning: "Condition de déblocage",
    status: "Statut",
    originalAwarded: "Obtenu à l'origine",
    close: "Fermer les détails du badge",
    dismiss: "Masquer les détails du badge",
  },
  reveal: {
    unlocked: "Badge débloqué",
    continue: "Terminer la révélation",
    notNow: "Pas maintenant",
    saving: "Enregistrement de la révélation…",
    queuePosition: "Badge {current} sur {total}",
    ackError:
      "La révélation de votre badge n'a pas été enregistrée. Vérifiez votre connexion et réessayez.",
    retry: "Réessayer la confirmation",
    transferUnavailable:
      "L'emplacement de la collection a changé. La révélation se terminera sans déplacement.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "Recrue IronClad",
      unlockMeaning:
        "Terminez la vérification de l'identité et de l'ELO pour devenir un joueur IronClad admissible.",
    },
    "first-deployment": {
      name: "Premier déploiement",
      unlockMeaning: "Terminez votre premier match officiel IronClad.",
    },
    "first-victory": {
      name: "Première victoire",
      unlockMeaning: "Remportez votre premier match officiel IronClad.",
    },
    "battle-tested": {
      name: "Aguerri",
      unlockMeaning: "Terminez 10 matchs officiels IronClad.",
    },
    "rising-through-the-ranks": {
      name: "Gravir les échelons",
      unlockMeaning:
        "Terminez un tournoi admissible dans une division supérieure à la première division dans laquelle vous avez terminé un tournoi IronClad.",
    },
    "first-campaign": {
      name: "Première campagne",
      unlockMeaning: "Terminez votre premier tournoi IronClad complet.",
    },
    "iron-regular": {
      name: "Habitué de fer",
      unlockMeaning: "Terminez 3 tournois IronClad.",
    },
    "tournament-veteran": {
      name: "Vétéran des tournois",
      unlockMeaning: "Terminez 10 tournois IronClad.",
    },
    "season-campaigner": {
      name: "Combattant de saison",
      unlockMeaning:
        "Terminez au moins 4 tournois admissibles durant une saison IronClad finalisée.",
    },
    "reliable-competitor": {
      name: "Concurrent fiable",
      unlockMeaning:
        "Terminez 10 participations prévues sans forfait confirmé de votre fait ni double forfait.",
    },
    "five-victories": {
      name: "Cinq victoires",
      unlockMeaning: "Remportez 5 matchs officiels IronClad.",
    },
    "ten-victories": {
      name: "Dix victoires",
      unlockMeaning: "Remportez 10 matchs officiels IronClad.",
    },
    "twenty-five-victories": {
      name: "Vingt-cinq victoires",
      unlockMeaning: "Remportez 25 matchs officiels IronClad.",
    },
    "iron-streak": {
      name: "Série de fer",
      unlockMeaning: "Remportez 3 matchs officiels joués consécutifs.",
    },
    unbroken: {
      name: "Invaincu",
      unlockMeaning: "Remportez 5 matchs officiels joués consécutifs.",
    },
    "clean-sweep": {
      name: "Sans bavure",
      unlockMeaning: "Remportez un BO3 2–0 ou un BO5 3–0.",
    },
    "comeback-commander": {
      name: "Commandant de la remontée",
      unlockMeaning: "Perdez la première manche, puis remportez la série officielle.",
    },
    "giant-slayer": {
      name: "Tombeur de géants",
      unlockMeaning:
        "Battez un adversaire dont l'ELO de tournoi vérifié est supérieur d'au moins 200 points.",
    },
    "giant-hunter": {
      name: "Chasseur de géants",
      unlockMeaning: "Obtenez l'accomplissement Tombeur de géants 3 fois distinctes.",
    },
    "flawless-campaign": {
      name: "Campagne parfaite",
      unlockMeaning:
        "Remportez un tournoi IronClad après avoir joué au moins une série officielle sans perdre une seule manche.",
    },
    "first-advance": {
      name: "Première avancée",
      unlockMeaning: "Remportez votre premier tour de tableau effectivement joué.",
    },
    semifinalist: {
      name: "Demi-finaliste",
      unlockMeaning: "Atteignez une demi-finale officielle de tournoi IronClad.",
    },
    finalist: {
      name: "Finaliste",
      unlockMeaning: "Atteignez une finale officielle de tournoi IronClad.",
    },
    "academy-champion": {
      name: "Champion Academy",
      unlockMeaning: "Remportez un tournoi officiel de division Academy.",
    },
    "challenge-champion": {
      name: "Champion Challenge",
      unlockMeaning: "Remportez un tournoi officiel de division Challenge.",
    },
    "elite-champion": {
      name: "Champion Élite",
      unlockMeaning: "Remportez un tournoi officiel de division Main/Elite.",
    },
    "double-champion": {
      name: "Double champion",
      unlockMeaning: "Remportez 2 tournois IronClad distincts.",
    },
    "triple-crown": {
      name: "Triple couronne",
      unlockMeaning:
        "Remportez au moins une fois des tournois des divisions Academy, Challenge et Main/Elite.",
    },
    "season-podium": {
      name: "Podium de saison",
      unlockMeaning: "Terminez dans le top 3 d'une saison officielle finalisée.",
    },
    "season-champion": {
      name: "Champion de saison",
      unlockMeaning: "Terminez 1er du classement officiel d'une saison finalisée.",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
