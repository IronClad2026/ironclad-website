import type { DictionaryShape } from "@/lib/i18n/types";
import type english from "@/lib/i18n/dictionaries/en/public-player-history";

const dictionary = {
  "order": "Inscrições mais recentes primeiro. O histórico é paginado.",
  "empty": "Ainda não há registros públicos de torneios.",
  "emptyPage": "Não há registros públicos de torneios nesta página.",
  "unavailable": "Não foi possível carregar os registros dos torneios. Tente novamente mais tarde.",
  "division": "Divisão: {division}",
  "eventIncomplete": "Evento não concluído",
  "withdrawn": "Desistência",
  "champion": "Campeão da divisão",
  "placement": "Colocação final: {rank}",
  "noPlacement": "Divisão concluída · colocação não registrada",
  "noFinalOutcome": "Sem resultado competitivo final",
  "resultPending": "Resultado final pendente",
  "entryRecord": "Séries oficiais: {played} disputadas · {wins} vitórias · {losses} derrotas",
  "pagination": "Páginas do histórico de torneios",
  "previous": "Registros mais recentes",
  "next": "Registros anteriores",
  "page": "Página {page}",
  "limit": "Os registros anteriores excedem o limite de consulta atual.",
  "scope": "Totais dos torneios desta página",
  "played": "Séries oficiais disputadas",
  "wins": "Vitórias em séries",
  "losses": "Derrotas em séries",
  "winRate": "Porcentagem de vitórias em séries",
  "notAvailable": "—",
  "rules": "Confrontos/séries oficiais concluídos, não partidas individuais. Resultados pendentes, folgas, ausências e avanços administrativos não contam como disputados. Desistências seguem as regras oficiais de confrontos disputados. Os totais abrangem apenas esta página.",
  "states": {
    "disabled": "Divisão indisponível",
    "filling": "Antes da competição",
    "ready": "Pronta para começar",
    "in_progress": "Divisão em andamento",
    "completed": "Divisão concluída",
    "not_held": "Divisão não realizada",
    "cancelled": "Evento cancelado",
    "voided": "Evento invalidado"
  }
} satisfies DictionaryShape<typeof english>;

export default dictionary;
