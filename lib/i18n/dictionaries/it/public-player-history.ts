import type { DictionaryShape } from "@/lib/i18n/types";
import type english from "@/lib/i18n/dictionaries/en/public-player-history";

const dictionary = {
  "order": "Prima le iscrizioni più recenti. Lo storico è suddiviso in pagine.",
  "empty": "Ancora nessun risultato pubblico dei tornei.",
  "emptyPage": "Nessun risultato pubblico dei tornei in questa pagina.",
  "unavailable": "Impossibile caricare i risultati dei tornei. Riprova più tardi.",
  "division": "Divisione: {division}",
  "eventIncomplete": "Evento non concluso",
  "withdrawn": "Ritirato",
  "champion": "Campione di divisione",
  "placement": "Piazzamento finale: {rank}",
  "noPlacement": "Divisione conclusa · piazzamento non registrato",
  "noFinalOutcome": "Nessun esito competitivo finale",
  "resultPending": "Risultato finale in attesa",
  "entryRecord": "Serie ufficiali: {played} giocate · {wins} vinte · {losses} perse",
  "pagination": "Pagine dello storico tornei",
  "previous": "Risultati più recenti",
  "next": "Risultati precedenti",
  "page": "Pagina {page}",
  "limit": "I risultati precedenti superano il limite di consultazione attuale.",
  "scope": "Totali dei tornei in questa pagina",
  "played": "Serie ufficiali giocate",
  "wins": "Serie vinte",
  "losses": "Serie perse",
  "winRate": "Percentuale di serie vinte",
  "notAvailable": "—",
  "rules": "Match/serie ufficiali conclusi, non singole partite. Risultati in attesa, bye, mancate presenze e avanzamenti amministrativi non contano come giocati. Le sconfitte a tavolino seguono le regole ufficiali dei match giocati. I totali coprono solo questa pagina.",
  "states": {
    "disabled": "Divisione non disponibile",
    "filling": "Prima della competizione",
    "ready": "Pronta a iniziare",
    "in_progress": "Divisione in corso",
    "completed": "Divisione conclusa",
    "not_held": "Divisione non disputata",
    "cancelled": "Evento annullato",
    "voided": "Evento invalidato"
  }
} satisfies DictionaryShape<typeof english>;

export default dictionary;

