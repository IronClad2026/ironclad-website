import type { HelpLegalUiDictionary } from "@/lib/i18n/dictionaries/en/help-legal-ui";

const dictionary = {
  metadata: {
    rulesTitle: "Regole | Tornei IronClad",
    rulesDescription:
      "Consulta la guida alle competizioni IronClad e accedi ai documenti normativi in vigore in inglese.",
    termsTitle: "Termini di servizio | Tornei IronClad",
    termsDescription:
      "Consulta i Termini di servizio in vigore in inglese di IronClad Tournaments e scarica il PDF della versione.",
    privacyTitle: "Informativa sulla privacy | Tornei IronClad",
    privacyDescription:
      "Consulta l’Informativa sulla privacy in vigore in inglese di IronClad Tournaments e scarica il PDF della versione.",
  },
  legalPage: {
    corpusEyebrow: "Corpus legale di IronClad Tournaments",
    effectiveEnglishNotice:
      "Il testo normativo in vigore è in inglese. Al momento non viene fornita alcuna traduzione ufficiale.",
    version: "Versione",
    status: "Stato",
    effectiveDate: "Data di entrata in vigore",
    downloadVersion: "Scarica il PDF della versione {version}",
    readCompanion: "Leggi {document}",
    contents: "Indice",
    contentsAria: "Indice di {document}",
    namedOperators: "Operatori indicati",
    section: "Sezione {number}",
    terms: "Informativa sulla privacy",
    privacy: "Termini di servizio",
  },
  rules: {
    hero: {
      eyebrow: "Centro ufficiale delle regole",
      title: "Regole delle competizioni IronClad",
      description:
        "Inizia dal riepilogo in linguaggio semplice, quindi consulta il Regolamento e l’Accordo di partecipazione del Giocatore nelle rispettive versioni per il testo normativo.",
      effective: "Set di documenti aggiornato · {date}",
      summaryAria: "Riepilogo operativo delle regole",
      operations: "Gestione dei Tornei",
      corpus: "Corpus normativo",
      corpusText:
        "Sono in vigore quattro documenti approvati e versionati. Ogni documento mostra la propria data di entrata in vigore.",
    },
    category: {
      eyebrow: "Scegli il gruppo di regole",
      title: "Inizia dalle regole applicabili al tuo Evento.",
      description:
        "Il selettore controlla l’esploratore dettagliato delle regole qui sotto e mantiene la pagina focalizzata sul formato competitivo che ti serve.",
      resetHelp:
        "Le categorie attive riportano l’esploratore delle regole al primo elemento, così il riepilogo riparte ogni volta dall’inizio.",
      aria: "Categorie delle regole",
      selected: "Selezionata",
      primaryDraft: "Documento principale: {document}",
    },
    tabs: {
      oneVOne: {
        eyebrow: "Competizione individuale",
        title: "REGOLE 1V1",
        description:
          "I Tornei di lancio IronClad sono Eventi 1v1 CoH3 gratuiti con Divisioni separate Academy, Challenge e Main / Pro da otto Giocatori. Quarti di finale e semifinali sono BO3; la finale è BO5.",
        document: "Rulebook v3.1",
      },
      rankings: {
        eyebrow: "Storico competitivo",
        title: "CLASSIFICHE E STAGIONI",
        description:
          "Academy e Challenge mantengono Classifiche permanenti di carriera. Main / Pro utilizza stagioni di sei Eventi validi. Solo le competizioni effettivamente disputate generano statistiche di gioco.",
        document: "Rulebook sections 13-14",
      },
      conduct: {
        eyebrow: "Accordo del Giocatore",
        title: "PPA E CONDOTTA",
        description:
          "Il PPA disciplina idoneità, titolarità dell’account, condotta, collaborazione sulle prove, obblighi relativi alla privacy, sanzioni, media e premi condizionati. La procedura dettagliata di gioco resta nel Regolamento.",
        document: "PPA v3.1",
      },
    },
    quick: {
      eyebrow: "Riepilogo rapido",
      title: "Leggi il riepilogo selezionato prima delle regole dettagliate.",
      description:
        "Il riepilogo della categoria presenta le informazioni di lancio senza duplicare integralmente i documenti normativi.",
      selected: "Riepilogo selezionato",
      documentStatusLabel: "Stato dei documenti",
      documentStatusTitle: "Corpus normativo approvato",
      documentStatusText:
        "Il Regolamento, il PPA, i Termini e l’Informativa sulla privacy attuali mostrano ciascuno la propria data di entrata in vigore. L’Iscrizione utilizza i rispettivi record di versione esatti.",
      navigationLabel: "Navigazione",
      navigationTitle: "Inizia dal tuo gruppo di regole",
      navigationText:
        "Scegli la categoria attiva prima di leggere i dettagli, così la pagina resta focalizzata sul tuo Evento.",
      integrityLabel: "Integrità",
      integrityTitle: "Linguaggio semplice, limiti precisi",
      integrityText:
        "Questa guida riassume l’attuale competizione 1v1 integrata e distingue chiaramente le funzionalità applicate dalla piattaforma dalle regole gestite dai Giocatori.",
    },
    explorer: {
      eyebrow: "Esplora le regole",
      title: "Regole dettagliate senza un muro di testo.",
      description:
        "Le sezioni espandibili mantengono leggibile la categoria attiva e consentono comunque di accedere a ogni riepilogo delle regole esistente.",
      active: "Gruppo di regole attivo",
    },
    sections: {
      oneVOne: {
        eligibilityTitle: "Idoneità e Iscrizione integrata",
        eligibilityText:
          "L’Iscrizione è gratuita e integrata in IronClad. I Giocatori devono avere almeno 18 anni, utilizzare il proprio account IronClad autenticato e il proprio account Steam collegato, completare una nuova verifica Relic 1v1 e accettare le versioni esatte dei documenti normativi presentati. Discord non è obbligatorio.",
        eloTitle: "Istantanea ELO e Divisione",
        eloText:
          "Il più alto ELO di fazione Relic 1v1 attuale e valido determina Academy (0–1099), Challenge (1100–1399) o Main / Pro (1400+). IronClad memorizza tale idoneità come istantanea immutabile dell’Iscrizione all’Evento, quindi successive variazioni dell’ELO in tempo reale non spostano il Giocatore per quell’Evento.",
        reviewTitle: "Revisione, Lista d’attesa e lancio",
        reviewText:
          "Le prime otto Iscrizioni valide entrano nel gruppo di revisione attiva; i Giocatori idonei successivi possono entrare nella Lista d’attesa FIFO. Un’offerta per un posto vacante usa la scadenza esatta mostrata da IronClad e riporta in revisione il Giocatore che accetta. Una Divisione viene avviata solo con esattamente otto Giocatori approvati, un tabellone pronto e il pool di mappe richiesto pubblicato.",
        seriesTitle: "Serie e impostazioni della lobby",
        seriesText:
          "Ogni Divisione è un tabellone a eliminazione diretta per otto Giocatori. Quarti di finale e semifinali sono BO3; la finale è BO5. I Giocatori configurano manualmente 1v1, 575 Victory Points, Standard Resources, posizioni iniziali Random e Cheats disattivati. IronClad non configura né convalida la lobby di CoH3.",
        mapTitle: "Pool di mappe pubblicato",
        mapText:
          "Ogni Divisione usa un pool pubblicato di almeno cinque mappe 1v1 attive. Può essere ripubblicato prima del lancio e viene bloccato all’avvio della Divisione. Dopo il lancio, una mappa può essere sostituita solo con una correzione verificata per un problema tecnico, una vulnerabilità, un aggiornamento del gioco o un motivo di integrità competitiva. La finalizzazione di un Sondaggio non modifica automaticamente il pool.",
        diceTitle: "Dadi e scelta manuale di lato/mappa",
        diceText:
          "Ogni Giocatore lancia i propri 2d6 autenticati per le partite 1, 3 e 5; le partite 3 e 5 possono essere lanciate in anticipo e, in caso di parità, entrambi i Giocatori devono completare un altro turno autenticato. Il vincitore sceglie il lato oppure una mappa idonea non ancora usata e l’avversario sceglie l’elemento rimanente. Ogni Giocatore può usare qualsiasi fazione consentita nel lato assegnato. Nelle partite pari, i Giocatori scambiano i lati e chi ha perso la partita precedente sceglie una nuova mappa. Di norma le mappe non si ripetono. IronClad registra lo storico dei Dadi, non le scelte di lato o mappa.",
        scheduleTitle: "Programmazione e comunicazione",
        scheduleText:
          "Stabilisci un primo contatto ragionevole appena possibile, normalmente entro 24 ore da quando il Match diventa disponibile; il mancato rispetto di questo obiettivo, da solo, non comporta una sconfitta automatica. Richiedi l’Assistenza Admin dopo 48 ore senza risposta, o prima se la scadenza rischia di essere compromessa. Le notifiche IronClad e l’Assistenza Admin sono le alternative garantite dalla piattaforma; Discord è facoltativo e Steam può essere usato, ove ragionevolmente disponibile, al di fuori di IronClad.",
        pauseTitle: "Pause e disconnessioni",
        pauseText:
          "Ogni Giocatore può fare una pausa ragionevole per partita in caso di un autentico problema tecnico o urgente, normalmente per un massimo di cinque minuti; una pausa aggiuntiva o più lunga richiede l’accordo dell’avversario o l’approvazione di un Admin. Una disconnessione effettiva prima delle 10:00 comporta normalmente il riavvio, fatte salve le eccezioni di equità approvate. Dalle 10:00 in poi non esiste un vincitore automatico: conserva il replay e richiedi una decisione di un Admin.",
        resultTitle: "Risultati e prova tramite replay",
        resultText:
          "Comunica tramite IronClad il vincitore della serie e il punteggio finale, allegando un replay CoH3 `.rec` univoco per ogni partita effettivamente disputata, fino a 10 MiB ciascuno. I replay sono privati. Gli screenshot non sono accettati come prova sostitutiva del risultato del Match; materiale integrativo separato può essere richiesto solo per una contestazione o un’indagine sull’integrità.",
        confirmationTitle: "Conferma, contestazioni e assenze",
        confirmationText:
          "L’avversario può confermare o contestare un risultato prima della scadenza mostrata, dopo la quale un risultato non contestato può essere confermato automaticamente. Le contestazioni passano alla revisione di un Admin. Una mancata presenza non può essere assegnata autonomamente e un bye, una vittoria a tavolino, una mancata presenza, un ramo vuoto del tabellone o una doppia sconfitta a tavolino non generano statistiche fittizie di partite disputate.",
      },
      rankings: {
        pointsTitle: "Punti per Divisione",
        pointsText:
          "Academy e Challenge assegnano 10 punti di partecipazione, 2 punti per ogni turno superato e 3 punti per la vittoria in un Torneo. Main / Pro assegna 10 punti di partecipazione, 5 punti per ogni turno superato e 5 punti per la vittoria in un Torneo.",
        playTitle: "Gioco effettivo",
        playText:
          "Il totale dei Match disputati, le vittorie, le sconfitte e la percentuale di vittorie includono solo serie effettivamente completate tra due Giocatori. Mancate presenze, bye automatici, vittorie a tavolino, rami vuoti del tabellone e doppie sconfitte a tavolino non generano statistiche di gioco, sebbene un avanzamento legittimo senza partita possa comunque assegnare i punti approvati per il superamento del turno.",
        careerTitle: "Classifiche di carriera",
        careerText:
          "Academy e Challenge mantengono Classifiche permanenti di carriera separate. Non si azzerano al termine di una stagione Main / Pro.",
        catchupTitle: "Recupero della carriera",
        catchupText:
          "Academy e Challenge possono assegnare +5 punti per ogni precedente Evento idoneo completato nella stessa Divisione al quale il Giocatore non ha partecipato, fino a +25. L’assegnazione è disponibile una sola volta per Giocatore e per Divisione e non si applica mai a Main / Pro.",
        seasonTitle: "Stagione Main / Pro",
        seasonText:
          "Una stagione Main / Pro comprende esattamente sei Eventi validi di qualificazione. Il settimo Evento dà inizio alla stagione successiva e la Classifica viene bloccata dopo l’assegnazione del punteggio del sesto Evento valido, salvo che una successiva verifica dell’integrità ponga la stagione in revisione.",
        rankingTitle: "Classifica e parità effettive",
        rankingText:
          "L’ordine della Classifica è determinato da punti totali, vittorie nei Tornei, turni superati, percentuale esatta di vittorie nei Match effettivi e infine vittorie nei Match effettivi. I Giocatori ancora pari in ogni criterio competitivo condividono la stessa posizione ufficiale. Nomi, ordine di visualizzazione o ID interni non risolvono una parità effettiva.",
        prizesTitle: "Premi condizionati",
        prizesText:
          "Una posizione in Classifica non corrisponde automaticamente a una posizione a premio. Ogni Evento con premi è disciplinato separatamente dai Termini dei premi pubblicati prima dell’Iscrizione. Se una parità effettiva coinvolge posizioni a premio e prima dell’Iscrizione non è stato pubblicato un diverso metodo equo, le assegnazioni interessate vengono sommate e divise in parti uguali tra i Giocatori pari. Non può essere introdotto alcun criterio di spareggio della Classifica non pubblicato.",
      },
      conduct: {
        accountsTitle: "Idoneità e account personali",
        accountsText:
          "I Giocatori devono avere almeno 18 anni, utilizzare i propri account IronClad e Steam collegati, fornire informazioni di idoneità accurate e completare le dichiarazioni presentate. Sono vietati la condivisione dell’account, la sostituzione d’identità, la sostituzione non autorizzata, l’uso di account secondari per manipolare il tabellone e l’Iscrizione duplicata.",
        discordTitle: "Discord facoltativo e coordinamento",
        discordText:
          "Discord è facoltativo ma consigliato. Le notifiche IronClad e la funzionalità Assistenza Admin relativa al Match sono le alternative garantite dalla piattaforma; Steam può essere usato, ove ragionevolmente disponibile, al di fuori di IronClad. La visibilità pubblica su Discord richiede un consenso separato.",
        integrityTitle: "Condotta e integrità",
        integrityText:
          "I Giocatori devono competere con onestà e rispetto. Imbrogli, manipolazione dei Match, abuso di vulnerabilità, sfruttamento della diretta avversaria, molestie, distruzione delle prove, votazioni fraudolente e ostacoli deliberati alla programmazione o di natura tecnica possono comportare sanzioni proporzionate.",
        pollTitle: "Partecipazione ai Sondaggi",
        pollText:
          "Prima della votazione, un Sondaggio del Torneo dichiara il proprio ambito e lo stato Consultivo o Vincolante; il pubblico idoneo viene bloccato alla pubblicazione. Ogni Giocatore idoneo può modificare una scheda autenticata attuale, con selezioni entro il limite pubblicato, fino alla chiusura. Il voto Consultivo orienta la decisione finale dell’Admin. Il voto Vincolante determina l’esito top-K configurato senza quorum, ma richiede almeno una scheda valida; un Sondaggio senza schede viene annullato o sostituito e una parità alla soglia viene risolta solo tra le opzioni pari su tale soglia. L’attribuzione delle singole schede è privata. I Giocatori idonei possono vedere i risultati aggregati in base alla visibilità configurata durante la votazione o dopo la chiusura; i totali pubblici anonimi esistono solo quando espressamente abilitati. La Decisione pubblicata finale può essere pubblica, ma la finalizzazione non modifica automaticamente un altro sottosistema.",
        evidenceTitle: "Prove e revisione degli Admin",
        evidenceText:
          "I Giocatori devono utilizzare onestamente gli strumenti di comunicazione dei risultati e di contestazione e collaborare alle richieste proporzionate di prove. Gli Admin possono esaminare replay privati, metadati dei Match, comunicazioni inviate e altro materiale affidabile, ma non richiedono password degli account, codici di autenticazione o accesso illimitato ai dispositivi personali.",
        privacyTitle: "Privacy e storico pubblico",
        privacyText:
          "La visibilità facoltativa del Profilo pubblico è separata dallo storico oggettivo della competizione. Replay privati, record dei Sondaggi, contestazioni e materiale di revisione degli Admin restano soggetti a controllo degli accessi. La chiusura dell’account può pseudonimizzare un account associato a uno storico anziché cancellare tabelloni, risultati e Classifiche ufficiali.",
        mediaTitle: "Streaming e media",
        mediaText:
          "Uno streaming personale consentito utilizza un ritardo di almeno due minuti, salvo che un Evento pubblicato o un’istruzione di trasmissione richieda un ritardo maggiore o rinunci espressamente a quello predefinito. I requisiti ufficiali di trasmissione e integrità hanno la precedenza. Gli obblighi finali relativi a media e privacy restano soggetti ai documenti normativi approvati.",
        prizesTitle: "Premi dell’Evento",
        prizesText:
          "La partecipazione è gratuita e non tutti gli Eventi prevedono premi. Un Evento con premi deve pubblicare importo lordo, valuta, ripartizione, requisiti sostanziali di idoneità, commissioni, metodo di pagamento supportato e tempistica prevista prima dell’Iscrizione. Il pagamento può essere gestito manualmente.",
        acceptanceTitle: "Accettazione della versione",
        acceptanceText:
          "L’Iscrizione registra le versioni esatte accettate del Regolamento, del PPA e dei Termini; la versione dell’Informativa sulla privacy di cui si è presa visione; l’identità autenticata; l’ora di accettazione del server; la dichiarazione di età pari o superiore a 18 anni; e le conferme relative agli account personali. L’Iscrizione è disponibile solo quando è in vigore un set completo di documenti approvati.",
      },
    },
    documents: {
      eyebrow: "Documenti ufficiali",
      title: "Stato dei documenti normativi.",
      description:
        "Le versioni attuali approvate costituiscono la fonte normativa ufficiale. Ogni scheda mostra la propria data di entrata in vigore.",
      immutable:
        "Scarica i PDF immutabili e versionati utilizzati per l’Iscrizione al Torneo.",
      version: "Versione {version}",
      effective: "In vigore dal {date}",
      readOnline: "Leggi online",
      read: "Leggi",
      opensNewTab: "(si apre in una nuova scheda)",
      download: "Scarica il PDF",
    },
    faq: {
      eyebrow: "DOMANDE FREQUENTI",
      title: "Risposte alle domande sul lancio più frequenti dei Giocatori.",
      description:
        "Queste risposte concise seguono il modello competitivo approvato senza sostituire i documenti normativi.",
      registerQuestion: "Come posso iscrivermi?",
      registerAnswer:
        "L’Iscrizione è gratuita e integrata in IronClad. Accedi, completa i campi obbligatori del Profilo, collega il tuo account Steam, completa una nuova verifica Relic 1v1, scegli la Divisione aperta per la quale sei idoneo, conferma di avere almeno 18 anni e di utilizzare i tuoi account e accetta le versioni esatte in vigore dei documenti normativi mostrate.",
      divisionQuestion: "Come viene determinata la mia Divisione?",
      divisionAnswer:
        "IronClad utilizza il più alto ELO di fazione 1v1 attuale e valido restituito dalla ricerca ufficiale di Relic: Academy è 0–1099, Challenge è 1100–1399 e Main / Pro è 1400+. Il server memorizza un’istantanea immutabile dell’Iscrizione, quindi successive variazioni dell’ELO in tempo reale non spostano l’Iscrizione a quell’Evento.",
      discordQuestion: "Discord è obbligatorio?",
      discordAnswer:
        "No. Discord è facoltativo ma consigliato. Le notifiche IronClad e la funzionalità Assistenza Admin relativa al Match offrono alternative sulla piattaforma. Steam può essere usato ove ragionevolmente disponibile. La visibilità pubblica su Discord richiede un consenso separato.",
      fullQuestion: "Cosa succede se una Divisione è piena?",
      fullAnswer:
        "I Giocatori idonei successivi possono entrare nella Lista d’attesa FIFO dopo che gli otto posti della revisione attiva sono stati occupati. Se si libera un posto prima del lancio, IronClad lo offre al Giocatore idoneo in Lista d’attesa da più tempo fino alla scadenza esatta mostrata. L’accettazione riporta il Giocatore in revisione, ma non garantisce l’approvazione. Una Divisione viene avviata solo con esattamente otto Giocatori approvati.",
      mapQuestion: "Come funziona il pool di mappe?",
      mapAnswer:
        "Ogni Divisione ha un pool pubblicato di almeno cinque mappe 1v1 attive. Può essere ripubblicato prima del lancio e viene bloccato al lancio. Dopo il lancio, una mappa può essere sostituita solo con una correzione verificata per un problema tecnico, una vulnerabilità, un aggiornamento del gioco o un motivo di integrità competitiva. La decisione di un Sondaggio non modifica automaticamente il pool.",
      diceQuestion: "Come funzionano i Dadi e le scelte di lato e mappa?",
      diceAnswer:
        "Ogni Giocatore lancia i propri 2d6 autenticati per le partite 1, 3 e 5; le partite 3 e 5 possono essere lanciate in anticipo e, in caso di parità dei totali, è necessario un altro turno autenticato. Il totale più alto sceglie il lato oppure una mappa idonea non ancora usata e l’avversario sceglie l’elemento rimanente. Ogni Giocatore può usare qualsiasi fazione consentita nel lato assegnato. Nelle partite 2 e 4, i Giocatori scambiano i lati e chi ha perso la partita precedente sceglie una nuova mappa. Di norma le mappe non si ripetono. IronClad memorizza lo storico dei Dadi, non le scelte di lato o mappa.",
      scheduleQuestion: "Quali sono le aspettative per la programmazione e gli aspetti tecnici?",
      scheduleAnswer:
        "Stabilisci un primo contatto ragionevole appena possibile, normalmente entro 24 ore; il mancato rispetto di questo obiettivo, da solo, non comporta una sconfitta automatica. Richiedi l’Assistenza Admin dopo 48 ore senza risposta o prima se la scadenza è a rischio. Ogni Giocatore può normalmente fare una pausa effettivamente necessaria per partita fino a cinque minuti. Una disconnessione effettiva prima delle 10:00 comporta normalmente il riavvio, fatte salve le eccezioni approvate; dalle 10:00 in poi non esiste un vincitore automatico, quindi conserva il replay e richiedi una decisione di un Admin.",
      replayQuestion: "Quali file di replay sono obbligatori?",
      replayAnswer:
        "Carica un replay CoH3 `.rec` univoco per ogni partita effettivamente disputata, fino a 10 MiB ciascuno. I replay sono privati. Gli screenshot non sono accettati come prova sostitutiva del risultato del Match; materiale integrativo separato può essere richiesto solo per una contestazione o un’indagine sull’integrità.",
      resultQuestion: "Cosa succede dopo la comunicazione di un risultato o di una mancata presenza?",
      resultAnswer:
        "L’avversario può confermare o contestare prima della scadenza mostrata. Un risultato non contestato può quindi essere confermato automaticamente; una contestazione passa alla revisione di un Admin. Una mancata presenza non può mai essere assegnata autonomamente. Le mancate presenze confermate e gli altri avanzamenti senza partita non generano statistiche fittizie di Match disputati.",
      standingsQuestion: "Come funzionano le Classifiche?",
      standingsAnswer:
        "Academy e Challenge alimentano Classifiche permanenti di carriera; Main / Pro utilizza esattamente sei Eventi validi di qualificazione per stagione. Le Classifiche usano punti totali, vittorie nei Tornei, turni superati, percentuale esatta di vittorie nei Match effettivi e infine vittorie nei Match effettivi. I Giocatori ancora pari in ogni criterio condividono la stessa posizione ufficiale.",
      pollQuestion: "Qual è la differenza tra Consultivo e Vincolante?",
      pollAnswer:
        "Un Sondaggio Consultivo orienta la decisione finale dell’Admin. Un Sondaggio Vincolante non ha quorum e determina l’esito top-K configurato quando esiste almeno una scheda valida; un Sondaggio Vincolante senza schede viene annullato o sostituito. L’attribuzione delle singole schede è privata. I Giocatori idonei vedono i totali aggregati in base alla visibilità configurata durante la votazione o dopo la chiusura, mentre i totali pubblici anonimi esistono solo quando espressamente abilitati. La Decisione pubblicata finale può essere pubblica, ma la finalizzazione non modifica automaticamente un altro sottosistema.",
      prizesQuestion: "Ogni Torneo prevede dei premi?",
      prizesAnswer:
        "No. La partecipazione è gratuita e una posizione in Classifica non corrisponde automaticamente a una posizione a premio. Prima che si aprano le Iscrizioni a un Evento con premi, la relativa Pagina del Torneo o i Termini dei premi devono pubblicare importo lordo, valuta, ripartizione, idoneità, commissioni, metodo di pagamento supportato e tempistica prevista. Il pagamento può essere gestito manualmente.",
    },
    disclaimer: {
      eyebrow: "Stato normativo",
      title: "Guida in linguaggio semplice",
      text:
        "Questa pagina è una guida in linguaggio semplice. Prevalgono la gerarchia dei documenti normativi e le versioni esatte accettate. Le Pagine dei Tornei, le Decisioni pubblicate e i Termini dei premi degli Eventi li integrano solo entro il rispettivo ambito dichiarato.",
      effective:
        "Il Regolamento, il PPA, i Termini e l’Informativa sulla privacy attuali mostrano ciascuno la propria data di entrata in vigore. L’Iscrizione registra la versione esatta presentata per ogni documento.",
      english:
        "Il testo normativo in vigore è in inglese. Al momento non viene fornita alcuna traduzione ufficiale.",
    },
  },
} satisfies HelpLegalUiDictionary;

export default dictionary;
