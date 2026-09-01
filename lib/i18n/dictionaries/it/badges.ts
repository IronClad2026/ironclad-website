import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "Collezione Badge | IronClad",
    pageDescription: "Consulta la tua collezione di Badge IronClad.",
    artworkAlt: "Grafica del Badge {name}",
  },
  rarity: {
    common: "Comune",
    uncommon: "Non comune",
    rare: "Raro",
    epic: "Epico",
    legendary: "Leggendario",
  },
  states: {
    earned: "Ottenuto",
    locked: "Bloccato",
    new: "Nuovo",
  },
  dashboard: {
    eyebrow: "Badge",
    title: "Collezione Badge IronClad",
    earnedWithBadges: "I tuoi ultimi traguardi IronClad sono raccolti qui.",
    empty:
      "Ottieni Badge gareggiando, vincendo e raggiungendo traguardi nei tornei IronClad.",
    earnedLabel: "Ottenuti",
    viewCollection: "Vedi collezione Badge",
    inspect: "Apri la collezione completa per vedere tutti i Badge ottenuti e bloccati.",
    explore: "Esplora ogni Badge e scopri come sbloccarlo.",
    featuredAria: "Badge in evidenza nella dashboard",
    progressAria: "{earned} Badge ottenuti su {total}",
    loadErrorTitle: "Collezione Badge non disponibile",
    loadErrorDescription:
      "Non è stato possibile caricare la tua collezione. I Badge ottenuti sono al sicuro.",
    retry: "Riprova",
  },
  collection: {
    back: "Torna alla dashboard",
    eyebrow: "Archivio traguardi",
    title: "Collezione Badge",
    description:
      "Consulta ogni Badge IronClad, la sua rarità e il traguardo necessario per ottenerlo.",
    earnedLabel: "Ottenuti",
    showing: "Visualizzati {shown} Badge su {total}",
    filters: {
      all: "Tutti",
      earned: "Ottenuti",
      locked: "Bloccati",
    },
    filtersAria: "Filtri della collezione Badge",
    slotsAria: "Spazi della collezione Badge IronClad",
    empty: "Nessun Badge corrisponde a questo filtro.",
  },
  detail: {
    eyebrow: "Traguardo IronClad",
    badgeNumber: "Badge {number}",
    unlockMeaning: "Requisito di sblocco",
    status: "Stato",
    originalAwarded: "Ottenuto originariamente",
    close: "Chiudi i dettagli del Badge",
    dismiss: "Ignora i dettagli del Badge",
  },
  reveal: {
    unlocked: "Badge sbloccato",
    continue: "Completa la rivelazione",
    notNow: "Non ora",
    saving: "Salvataggio rivelazione…",
    queuePosition: "Badge {current} di {total}",
    ackError:
      "La rivelazione del Badge non è stata salvata. Controlla la connessione e riprova.",
    retry: "Riprova conferma",
    transferUnavailable:
      "Lo spazio nella collezione è cambiato. Completa la rivelazione senza movimento.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "Recluta IronClad",
      unlockMeaning:
        "Completa la verifica dell'identità e dell'ELO e diventa un giocatore IronClad idoneo.",
    },
    "first-deployment": {
      name: "Primo schieramento",
      unlockMeaning: "Completa la tua prima partita ufficiale IronClad.",
    },
    "first-victory": {
      name: "Prima vittoria",
      unlockMeaning: "Vinci la tua prima partita ufficiale IronClad.",
    },
    "battle-tested": {
      name: "Temprato dalla battaglia",
      unlockMeaning: "Completa 10 partite ufficiali IronClad.",
    },
    "rising-through-the-ranks": {
      name: "Scalata dei ranghi",
      unlockMeaning:
        "Completa un torneo valido in una divisione superiore alla prima divisione in cui hai completato un torneo IronClad.",
    },
    "first-campaign": {
      name: "Prima campagna",
      unlockMeaning: "Completa il tuo primo torneo IronClad completo.",
    },
    "iron-regular": {
      name: "Presenza di ferro",
      unlockMeaning: "Completa 3 tornei IronClad.",
    },
    "tournament-veteran": {
      name: "Veterano dei tornei",
      unlockMeaning: "Completa 10 tornei IronClad.",
    },
    "season-campaigner": {
      name: "Combattente stagionale",
      unlockMeaning:
        "Completa almeno 4 tornei validi in una stagione IronClad finalizzata.",
    },
    "reliable-competitor": {
      name: "Concorrente affidabile",
      unlockMeaning:
        "Completa 10 presenze programmate senza un'assenza confermata causata da te o una doppia assenza.",
    },
    "five-victories": {
      name: "Cinque vittorie",
      unlockMeaning: "Vinci 5 partite ufficiali IronClad.",
    },
    "ten-victories": {
      name: "Dieci vittorie",
      unlockMeaning: "Vinci 10 partite ufficiali IronClad.",
    },
    "twenty-five-victories": {
      name: "Venticinque vittorie",
      unlockMeaning: "Vinci 25 partite ufficiali IronClad.",
    },
    "iron-streak": {
      name: "Serie di ferro",
      unlockMeaning: "Vinci 3 partite ufficiali giocate consecutive.",
    },
    unbroken: {
      name: "Imbattuto",
      unlockMeaning: "Vinci 5 partite ufficiali giocate consecutive.",
    },
    "clean-sweep": {
      name: "Vittoria netta",
      unlockMeaning: "Vinci un BO3 per 2–0 o un BO5 per 3–0.",
    },
    "comeback-commander": {
      name: "Comandante della rimonta",
      unlockMeaning: "Perdi Gara 1 e poi vinci la serie ufficiale.",
    },
    "giant-slayer": {
      name: "Ammazzagrandi",
      unlockMeaning:
        "Sconfiggi un avversario con un ELO verificato per il torneo superiore di almeno 200 punti.",
    },
    "giant-hunter": {
      name: "Cacciatore di giganti",
      unlockMeaning: "Ottieni il traguardo Ammazzagrandi 3 volte distinte.",
    },
    "flawless-campaign": {
      name: "Campagna impeccabile",
      unlockMeaning:
        "Vinci un torneo IronClad dopo aver giocato almeno una serie ufficiale senza perdere una singola gara.",
    },
    "first-advance": {
      name: "Prima avanzata",
      unlockMeaning: "Vinci il tuo primo turno giocato nel tabellone del torneo.",
    },
    semifinalist: {
      name: "Semifinalista",
      unlockMeaning: "Raggiungi una semifinale ufficiale di un torneo IronClad.",
    },
    finalist: {
      name: "Finalista",
      unlockMeaning: "Raggiungi una finale ufficiale di un torneo IronClad.",
    },
    "academy-champion": {
      name: "Campione Academy",
      unlockMeaning: "Vinci un torneo ufficiale della divisione Academy.",
    },
    "challenge-champion": {
      name: "Campione Challenge",
      unlockMeaning: "Vinci un torneo ufficiale della divisione Challenge.",
    },
    "elite-champion": {
      name: "Campione Elite",
      unlockMeaning: "Vinci un torneo ufficiale della divisione Main/Elite.",
    },
    "double-champion": {
      name: "Due volte campione",
      unlockMeaning: "Vinci 2 tornei IronClad distinti.",
    },
    "triple-crown": {
      name: "Tripla corona",
      unlockMeaning:
        "Vinci almeno una volta un torneo delle divisioni Academy, Challenge e Main/Elite.",
    },
    "season-podium": {
      name: "Podio stagionale",
      unlockMeaning: "Concludi una stagione ufficiale finalizzata tra i primi 3.",
    },
    "season-champion": {
      name: "Campione stagionale",
      unlockMeaning: "Arriva 1° nella classifica stagionale ufficiale finalizzata.",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
