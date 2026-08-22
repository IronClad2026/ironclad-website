import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  center: {
    eyebrow: "Notifiche",
    totalSummary: "{total} totali · {unread} non lette",
    selectAll: "Seleziona tutto",
    selected: "{count} selezionate",
    markSelectedRead: "Segna le selezionate come lette",
    deleteSelected: "Elimina selezionate",
    markAllRead: "Segna tutte come lette",
    selectNotification: "Seleziona {title}",
    new: "Nuova",
    deadline: "Scadenza: {value}",
    selectMatchConfirmation: "Seleziona la notifica di conferma del Risultato del Match",
    noShowConfirmationTitle: "Conferma del no-show richiesta",
    resultConfirmationTitle: "Conferma del Risultato del Match richiesta",
    noShowConfirmationMessage:
      "Il tuo avversario ha segnalato un no-show per {tournamentName}.",
    resultConfirmationMessage:
      "Il tuo avversario ha inviato un Risultato per {tournamentName}. Punteggio segnalato: {score}.",
    openToRespond: "Apri il Torneo per confermare o avviare una Contestazione",
    unknownTime: "Ora sconosciuta",
    pushTitle: "Avvisi dispositivo",
    pushDescription:
      "Consenti gli avvisi IronClad importanti su questo dispositivo. Non verrà richiesto nulla finché non scegli Attiva.",
    pushChecking: "Controllo dello stato delle notifiche su questo dispositivo…",
    pushEnable: "Attiva notifiche",
    pushDisable: "Disattiva su questo dispositivo",
    pushEnabling: "Attivazione…",
    pushDisabling: "Disattivazione…",
    pushEnabled: "Le notifiche sono attive su questo dispositivo.",
    pushEnabledLabel: "Attivi",
    pushDisabled: "Le notifiche sono disattivate su questo dispositivo.",
    pushBlocked:
      "Le notifiche sono bloccate nelle impostazioni del browser o del dispositivo.",
    pushInstallRequired:
      "Su iPhone o iPad, installa IronClad sulla schermata Home prima di attivare le notifiche.",
    pushUnsupported: "Questo browser non supporta Web Push.",
    pushUnavailable: "Impossibile aggiornare le notifiche. Riprova.",
    pushPrivacy:
      "Gli avvisi possono apparire nella schermata di blocco. Mantieni private le anteprime delle notifiche nelle impostazioni del dispositivo.",
  },
  dashboard: {
    title: "Azioni match",
    description:
      "Conferme di Risultati, Contestazioni, elementi rifiutati o da reinviare e altre azioni che richiedono una tua risposta.",
    actionRequiredIndicator: "Azione richiesta",
    noActionsRequired: "Nessuna azione richiesta",
    noMessages: "Nessun messaggio sui Match",
    messageOne: "1 messaggio sui Match",
    messageFew: "{count} messaggi sui Match",
    messageMany: "{count} messaggi sui Match",
    messageOther: "{count} messaggi sui Match",
    actionRequiredOne: "1 richiede un'azione",
    actionRequiredFew: "{count} richiedono un'azione",
    actionRequiredMany: "{count} richiedono un'azione",
    actionRequiredOther: "{count} richiedono un'azione",
    empty: "Non ci sono Azioni match in attesa di una tua risposta.",
    clearSelection: "Annulla selezione",
    selectAll: "Seleziona tutto",
    deleteSelected: "Elimina selezionate",
    deleteAll: "Elimina tutte",
    updating: "Aggiornamento notifiche…",
    selectNotification: "Seleziona notifica {label}",
    deleteNotification: "Elimina notifica {label}",
    close: "Chiudi notifica",
    modalEyebrow: "Notifica del Match",
    opponent: "Avversario",
    report: "Segnalazione",
    score: "Punteggio",
    time: "Ora",
    unavailable: "Non disponibile",
    noShowForfeit: "No-show / sconfitta a tavolino",
    disputeNotes: "Note facoltative sulla Contestazione",
    confirmNoShow: "Conferma no-show",
    confirmResult: "Conferma Risultato",
    disputeNoShow: "Contesta no-show",
    disputeResult: "Contesta Risultato",
    tournament: "Torneo",
    match: "Match",
    matchValue: "{roundName} · Match {matchNumber}",
    submission: "Invio",
    forfeitWinner: "Vincitore a tavolino",
    reportedWinner: "Vincitore segnalato",
    missingPlayer: "Giocatore assente",
    reportedLoser: "Sconfitto segnalato",
    reportType: "Tipo di segnalazione",
    reportedScore: "Punteggio segnalato",
    status: "Stato",
    timeRemaining: "Tempo rimanente",
    reviewed: "Revisionata",
    submitted: "Inviata",
    administratorMessage: "Messaggio dell'amministratore",
    expiredNotice:
      "La finestra di conferma è scaduta. L'approvazione automatica è in attesa del processo programmato.",
    noShowReport: "Segnalazione di no-show",
    submissionNumber: "Invio #{number}",
    resultConfirmation: "Conferma del Risultato",
    timeUnavailable: "Tempo rimanente non disponibile",
    expired: "Scaduto · in attesa dell'automazione",
    hoursRemaining: "{hours} h {minutes} min rimanenti",
    minutesRemaining: "{minutes} min {seconds} s rimanenti",
    secondsRemaining: "{seconds} s rimanenti",
    actions: {
      signInRequired: "Accedi prima di gestire le notifiche dei Match.",
      selectionRequired: "Seleziona almeno una notifica.",
      updateFailed: "Impossibile aggiornare le notifiche.",
      unavailable: "Non sono disponibili notifiche per il giocatore.",
      notificationUnavailable:
        "Una o più notifiche non sono più disponibili.",
      alreadyDeleted: "Tutte le notifiche sono già state eliminate.",
      deletedOne: "1 notifica eliminata.",
      deletedFew: "{count} notifiche eliminate.",
      deletedMany: "{count} notifiche eliminate.",
      deletedOther: "{count} notifiche eliminate.",
      resultUnavailable: "Impossibile trovare la conferma del Risultato del Match.",
      confirmFailed: "Impossibile confermare il Risultato del Match. Riprova.",
      confirmed: "Risultato confermato. Il tabellone è stato aggiornato.",
      disputeNotesTooLong:
        "Le note della Contestazione non possono superare 2.000 caratteri.",
      disputeFailed: "Impossibile contestare il Risultato del Match. Riprova.",
      disputed: "Risultato contestato. Un amministratore deve esaminarlo.",
    },
  },
  status: {
    pending: "In revisione",
    approved: "Approvato",
    rejected: "Rifiutato",
    resubmissionRequested: "Nuovo invio richiesto",
    pendingConfirmation: "In attesa della conferma dell'avversario",
    confirmed: "Confermato",
    autoApproved: "Approvato automaticamente",
    disputed: "Contestato",
    underReview: "In revisione",
    reset: "Reimpostato",
  },
  matchContent: {
    noShowAwaitingTitle: "Segnalazione di no-show in attesa di conferma",
    noShowAwaitingMessage:
      "La segnalazione di no-show è stata inviata. Il tuo avversario deve confermarla o contestarla prima della scadenza.",
    submissionAwaitingTitle: "Invio #{number} in attesa di conferma",
    submissionAwaitingMessage:
      "Il Risultato del Match è stato inviato. Il tuo avversario deve confermarlo o contestarlo prima della scadenza.",
    noShowConfirmationTitle: "Conferma del no-show richiesta",
    noShowConfirmationMessage:
      "Il tuo avversario ti ha segnalato come no-show in {tournamentName}. Conferma o contesta la segnalazione prima che scada la finestra di conferma.",
    resultConfirmationTitle: "Conferma del Risultato del Match richiesta",
    resultConfirmationMessage:
      "Il tuo avversario ha inviato il Risultato del vostro Match in {tournamentName}. Confermalo o contestalo prima che scada la finestra di conferma.",
    noShowApprovedTitle: "Segnalazione di no-show approvata",
    noShowApprovedMessage: "La segnalazione di no-show è stata approvata e registrata.",
    resultApprovedTitle: "Risultato del Match approvato",
    resultApprovedMessage: "Il Risultato ufficiale è stato approvato e registrato.",
    noShowConfirmedTitle: "No-show confermato",
    noShowConfirmedMessage: "La segnalazione di no-show è stata confermata e registrata.",
    resultConfirmedTitle: "Risultato del Match confermato",
    resultConfirmedMessage:
      "Il Risultato è stato confermato dall'avversario e registrato.",
    noShowAutoTitle: "No-show confermato automaticamente",
    noShowAutoMessage:
      "La finestra di conferma è scaduta senza Contestazioni, quindi il no-show è stato confermato automaticamente.",
    resultAutoTitle: "Risultato del Match approvato automaticamente",
    resultAutoMessage:
      "La finestra di conferma è scaduta senza Contestazioni, quindi il Risultato è stato approvato automaticamente.",
    noShowRejectedTitle: "Segnalazione di no-show rifiutata",
    noShowRejectedMessage:
      "La segnalazione di no-show è stata rifiutata. Leggi il messaggio dell'amministratore prima di continuare.",
    resultRejectedTitle: "Risultato del Match rifiutato",
    resultRejectedMessage:
      "Leggi il messaggio dell'amministratore prima di inviare le prove corrette.",
    noShowDisputedTitle: "No-show contestato",
    noShowDisputedMessage:
      "Questa segnalazione di no-show è stata contestata e ora richiede la revisione di un amministratore.",
    resultDisputedTitle: "Risultato del Match contestato",
    resultDisputedMessage:
      "Questo Risultato è stato contestato e ora richiede la revisione di un amministratore.",
    noShowReviewTitle: "No-show in revisione",
    noShowReviewMessage: "Un amministratore sta esaminando questa Contestazione di no-show.",
    resultReviewTitle: "Risultato del Match in revisione",
    resultReviewMessage: "Un amministratore sta esaminando questo Risultato contestato.",
    resubmissionTitle: "Nuovo invio del Risultato richiesto",
    resubmissionMessage:
      "Un amministratore richiede un Risultato corretto o prove aggiuntive.",
    resetTitle: "Risultato del Match reimpostato",
    resetMessage: "La segnalazione del Risultato è stata reimpostata e il Match resta irrisolto.",
    submittedReviewTitle: "L'invio #{number} è in revisione",
    submittedReviewMessage: "Il Risultato del Match è stato inviato correttamente.",
    opponentSubmittedTitle: "Il tuo avversario ha inviato un Risultato del Match",
    opponentSubmittedMessage:
      "Il Risultato segnalato è in revisione da parte dell'amministratore. Apri questo messaggio per esaminare la segnalazione.",
  },
  server: {
    loadError: "Impossibile caricare le notifiche.",
    tournamentFallback: "questo Torneo IronClad",
    tournamentCancelledTitle: "Torneo annullato",
    tournamentCancelledMessage:
      "{tournamentName} è stato annullato. La tua Iscrizione è chiusa e non è stato registrato alcun Risultato competitivo ufficiale.",
    tournamentVoidedTitle: "Torneo invalidato",
    tournamentVoidedMessage:
      "{tournamentName} è stato invalidato. Il suo storico competitivo resta disponibile, ma i Risultati non contano più per le classifiche IronClad.",
    registrationApprovedTitle: "Iscrizione approvata",
    registrationApprovedMessage:
      "La tua Iscrizione a {tournamentName} è stata approvata.",
    waitlistOfferTitle: "È disponibile un posto nel Torneo",
    waitlistOfferMessage:
      "È disponibile un posto in {tournamentName}. Apri la Dashboard per accettarlo o rifiutarlo prima che l'offerta scada.",
    waitlistClosedTitle: "Lista d'attesa chiusa",
    waitlistClosedMessage:
      "La lista d'attesa per {tournamentName} ora è chiusa.",
    registrationRejectedTitle: "Iscrizione non approvata",
    registrationRejectedMessage:
      "La tua Iscrizione a {tournamentName} non è stata approvata.",
    registrationWaitlistedTitle: "Iscrizione aggiunta alla lista d'attesa",
    registrationWaitlistedMessage:
      "La tua Iscrizione a {tournamentName} è in lista d'attesa.",
    registrationReviewTitle: "Iscrizione in revisione",
    registrationReviewMessage:
      "La tua Iscrizione a {tournamentName} richiede la revisione di un amministratore.",
    matchReadyTitle: "Match pronto",
    matchReadyMessage: "Il tuo prossimo Match in {tournamentName} è pronto.",
    automaticAdvanceTitle: "Avanzamento automatico",
    automaticAdvanceMessage:
      "La tua posizione nel tabellone di {tournamentName} è avanzata automaticamente.",
    deadlineUpdatedTitle: "Scadenza del Match aggiornata",
    deadlineUpdatedMessage:
      "Lo stato della scadenza del tuo Match in {tournamentName} è cambiato.",
    deadlineReminderTitle: "Promemoria scadenza del Match",
    deadlineReminderMessage:
      "Il tuo Match in {tournamentName} si avvicina alla scadenza.",
    deadlineRulingTitle: "Decisione sulla scadenza del Match",
    deadlineRulingMessage:
      "È stata registrata una decisione ufficiale sulla scadenza del tuo Match in {tournamentName}.",
    confirmationRequiredTitle: "Conferma del Risultato del Match richiesta",
    confirmationRequiredMessage:
      "Apri il tuo Match in {tournamentName} per confermare o contestare il Risultato segnalato.",
    resultSubmittedTitle: "Risultato del Match inviato",
    resultSubmittedMessage:
      "Un Risultato del Match in {tournamentName} è in attesa di conferma o revisione.",
    noShowReportedTitle: "No-show segnalato",
    noShowReportedMessage:
      "Una segnalazione di no-show in {tournamentName} è in attesa di conferma o revisione.",
    noShowConfirmedTitle: "No-show confermato",
    noShowConfirmedMessage:
      "La segnalazione di no-show in {tournamentName} è stata confermata.",
    noShowDisputedTitle: "No-show contestato",
    noShowDisputedMessage:
      "La segnalazione di no-show in {tournamentName} richiede la revisione di un amministratore.",
    noShowApprovedTitle: "No-show approvato",
    noShowApprovedMessage:
      "La segnalazione di no-show in {tournamentName} è stata approvata e registrata.",
    noShowRejectedTitle: "No-show rifiutato",
    noShowRejectedMessage:
      "La segnalazione di no-show in {tournamentName} è stata rifiutata.",
    noShowReviewTitle: "Segnalazione di no-show da revisionare",
    noShowReviewMessage:
      "La segnalazione di no-show in {tournamentName} richiede la revisione di un amministratore.",
    resultApprovedTitle: "Risultato del Match approvato",
    resultApprovedMessage:
      "Il Risultato del Match in {tournamentName} è stato approvato e registrato.",
    resultReviewTitle: "Risultato del Match da revisionare",
    resultReviewMessage:
      "Il Risultato del Match in {tournamentName} richiede la revisione di un amministratore.",
    pollPublishedTitle: "È richiesto il tuo voto",
    pollPublishedMessage:
      "È disponibile un sondaggio per te in {tournamentName}. Aprilo per vedere la domanda nella lingua originale e votare.",
    decisionPublishedTitle: "Decisione pubblicata",
    decisionPublishedMessage:
      "È stata pubblicata una decisione per {tournamentName}. Aprila per leggerla nella lingua originale.",
  },
} as const;
export type NotificationsDictionary = DictionaryShape<typeof dictionary>;
export default dictionary;
