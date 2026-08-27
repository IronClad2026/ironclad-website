import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "Pagina iniziale",
    tournaments: "Tornei",
    players: "Giocatori",
    rules: "Regole",
    leaderboardAndRankings: "Classifica e posizioni",
    about: "Chi siamo",
    dashboard: "Pannello di controllo",
    admin: "Admin",
    account: "Account",
    signIn: "Accedi",
    support: "Assistenza",
    supportTrigger: "Apri l’assistenza",
    supportMessage: "Apri un ticket con noi su Discord per ricevere assistenza.",
    openDiscordSupport: "Apri l’assistenza Discord",
    announcements: "Annunci",
    announcementsUnread: "Annunci — nuovo annuncio ufficiale",
    primaryNavigation: "Navigazione principale",
    mobileNavigation: "Navigazione mobile",
    openMenu: "Apri il menu di navigazione",
    closeMenu: "Chiudi il menu di navigazione",
  },
  footer: {
    copyright: "© {year} IronClad. Tutti i diritti riservati.",
    legalAndRules: "Informazioni legali e regole",
    rules: "Regole",
    rulebook: "Regolamento",
    participationAgreement: "Accordo di partecipazione del Giocatore",
    participationAgreementShort: "PPA",
    terms: "Termini di servizio",
    privacy: "Informativa sulla privacy",
    opensInNewTab: "{label} (si apre in una nuova scheda)",
  },
  actions: {
    loading: "Caricamento…",
    retry: "Riprova",
    close: "Chiudi",
    cancel: "Annulla",
    back: "Indietro",
    save: "Salva",
    continue: "Continua",
    success: "Operazione riuscita",
    error: "Errore",
  },
  analyticsConsent: {
    label: "Analisi facoltative",
    title: "Aiutaci a migliorare IronClad",
    description:
      "Le analisi facoltative del sito ci aiutano a comprendere le visite e l’utilizzo delle pagine. Vengono caricate solo dopo il tuo consenso.",
    details:
      "Quando sono abilitate, Vercel può ricevere il percorso della pagina pubblica, il referrer, il Paese approssimativo, il tipo di dispositivo, il browser e il sistema operativo. IronClad non utilizza cookie di analisi, pubblicità o registrazioni delle sessioni.",
    required:
      "Le funzionalità necessarie di autenticazione e sicurezza non sono interessate da questa scelta.",
    allow: "Consenti le analisi",
    decline: "Rifiuta",
    privacyLink: "Leggi l’Informativa sulla privacy",
    choices: "Preferenze per le analisi",
    dialogTitle: "Preferenze per le analisi",
    dialogDescription:
      "Puoi modificare in qualsiasi momento la scelta relativa alle analisi per questo browser. La revoca interrompe la raccolta futura dei dati di analisi.",
    close: "Chiudi le preferenze per le analisi",
    currentChoice: "Scelta attuale",
    statusGranted: "Analisi consentite",
    statusDeclined: "Analisi disattivate",
    statusUndecided: "Nessuna scelta salvata",
    withdraw: "Revoca il consenso alle analisi",
    saveError:
      "Non è stato possibile salvare la tua scelta. Le analisi sono disattivate in questa scheda, ma la modifica potrebbe non essere mantenuta. Controlla le impostazioni di archiviazione del browser e riprova.",
    savedGranted: "Analisi consentite per questo browser.",
    savedDeclined: "Le analisi restano disattivate per questo browser.",
  },
  legalUpdate: {
    eyebrow: "Importante aggiornamento legale",
    title: "Consulta e accetta i termini aggiornati",
    description:
      "Per continuare a utilizzare le funzionalità di IronClad che richiedono l’accesso, consulta e accetta i Termini di servizio v{termsVersion} e prendi visione dell’Informativa sulla privacy v{privacyVersion}. Le analisi restano facoltative e costituiscono una scelta separata.",
    termsLinkLabel: "Leggi i Termini di servizio",
    privacyLinkLabel: "Leggi l’Informativa sulla privacy",
    termsAgreement: "Accetto i Termini di servizio v{termsVersion}.",
    privacyAcknowledgement:
      "Dichiaro di aver preso visione dell’Informativa sulla privacy v{privacyVersion}.",
    continueAction: "Accetta e continua",
    savingAction: "Salvataggio dell’accettazione…",
    signOutAction: "Esci",
    retryAction: "Riprova",
    unavailableTitle: "Aggiornamento legale temporaneamente non disponibile",
    unavailableDescription:
      "IronClad non può verificare i documenti legali attuali in questo momento. Non è stata registrata alcuna accettazione. Riprova o esci.",
    authRequiredError: "Accedi di nuovo per continuare.",
    acceptanceRequiredError: "Sono richieste entrambe le conferme legali.",
    unavailableError:
      "IronClad non ha potuto registrare la tua accettazione. Non è stato salvato nulla. Riprova.",
    acceptedMessage: "Accettazione registrata. Caricamento di IronClad…",
  },
  selector: {
    language: "Lingua",
    triggerAriaLabel: "Scegli la lingua. Lingua attuale: {language}",
    languageRowLabel: "Lingua",
    title: "Scegli la tua lingua",
    description: "Seleziona la lingua dell’esperienza Giocatore di IronClad.",
    closeLabel: "Chiudi il selettore della lingua",
    selectedLabel: "Selezionata",
    savingLabel: "Salvataggio della lingua…",
    saveError: "Non è stato possibile salvare la lingua preferita. Riprova.",
    translationReviewNotice:
      "Le traduzioni sono fornite per comodità e sono state revisionate con cura, ma potrebbero non essere state verificate da un madrelingua. L’inglese rimane la lingua di riferimento.",
    privacyHeading: "Preferenza della lingua",
    privacyCookie:
      "IronClad memorizza la tua scelta esplicita in un cookie funzionale proprietario per un periodo massimo di circa un anno.",
    privacyClerk:
      "Se hai effettuato l’accesso, la scelta può anche essere memorizzata privatamente con Clerk affinché le e-mail transazionali gestite dall’app possano utilizzarla.",
    privacyNoTracking:
      "Questa preferenza non viene utilizzata per pubblicità o tracciamento tra siti.",
    privacyNotEvidence:
      "Non costituisce prova di ubicazione, giurisdizione legale, consenso o comprensione.",
    privacyChange: "Puoi modificare questa preferenza qui in qualsiasi momento.",
    privacyPolicyLink: "Leggi l’Informativa sulla privacy",
  },
  install: {
    mobile: "IronClad Mobile", title: "Installa IronClad", close: "Chiudi le istruzioni di installazione",
    description: "Aggiungi IronClad alla schermata Home per accedere più rapidamente e utilizzarlo a schermo intero come un’app.",
    now: "Installa ora", promptHelp: "Il browser aprirà la richiesta di installazione sicura.",
    iosMenuTitle: "Apri il menu", iosMenuText: "Tocca il pulsante ⋯ (Altro) in Safari.", shareTitle: "Condividi", shareText: "Tocca Condividi.",
    homeTitle: "Aggiungi alla schermata Home", homeText: "Seleziona “Aggiungi alla schermata Home”. Se non lo vedi, tocca “Altro” e cercalo nell’elenco.", addTitle: "Installa", addText: "Tocca “Aggiungi”.",
    browserMenuTitle: "Apri il menu del browser", browserMenuText: "Tocca il pulsante del menu in Chrome, Edge o nel tuo browser.", appTitle: "Installa l’app", appText: "Scegli “Installa app” o “Aggiungi alla schermata Home”.",
    confirmTitle: "Conferma", confirmText: "Conferma l’installazione quando richiesto.", download: "Scarica la nostra app", step: "Passaggio {number}",
  },
  music: { playerLabel: "Lettore del tema musicale di IronClad", pause: "Metti in pausa il tema di IronClad", play: "Riproduci il tema di IronClad", unavailable: "Musica non disponibile" },
  legal: {
    effectiveEnglishNotice:
      "Il testo normativo in vigore è in inglese. Al momento non viene fornita alcuna traduzione ufficiale.",
    read: "Leggi",
    download: "Scarica",
    continueInEnglish: "Continua in inglese",
    goBack: "Torna indietro",
  },
  errors: {
    notFoundEyebrow: "404 · Pagina non trovata",
    notFoundTitle: "Impossibile trovare questa pagina.",
    notFoundDescription: "Il link potrebbe essere obsoleto oppure la pagina potrebbe essere stata spostata.",
    returnHome: "Torna alla pagina iniziale",
    unexpectedTitle: "Si è verificato un problema.",
    unexpectedDescription:
      "IronClad non ha potuto caricare questa esperienza Giocatore. Riprova.",
    retry: "Riprova",
    loading: "Caricamento…",
  },
} satisfies CommonDictionary;

export default dictionary;
