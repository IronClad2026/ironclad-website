import type { DictionaryShape } from "@/lib/i18n/types";
import type english from "@/lib/i18n/dictionaries/en/public-player-history";

const dictionary = {
  "order": "Inscripciones más recientes primero. El historial está paginado.",
  "empty": "Aún no hay registros públicos de torneos.",
  "emptyPage": "No hay registros públicos de torneos en esta página.",
  "unavailable": "No se pudieron cargar los registros de torneos. Inténtalo más tarde.",
  "division": "División: {division}",
  "eventIncomplete": "Evento sin finalizar",
  "withdrawn": "Retirado",
  "champion": "Campeón de división",
  "placement": "Posición final: {rank}",
  "noPlacement": "División finalizada · posición no registrada",
  "noFinalOutcome": "Sin resultado competitivo final",
  "resultPending": "Resultado final pendiente",
  "entryRecord": "Series oficiales: {played} jugadas · {wins} ganadas · {losses} perdidas",
  "pagination": "Páginas del historial de torneos",
  "previous": "Registros más recientes",
  "next": "Registros anteriores",
  "page": "Página {page}",
  "limit": "Los registros anteriores superan el límite de consulta actual.",
  "scope": "Totales de los torneos de esta página",
  "played": "Series oficiales jugadas",
  "wins": "Series ganadas",
  "losses": "Series perdidas",
  "winRate": "Porcentaje de series ganadas",
  "notAvailable": "—",
  "rules": "Encuentros/series oficiales completados, no partidas individuales. Los resultados pendientes, pases libres, ausencias y avances administrativos no cuentan como jugados. Las derrotas por incomparecencia siguen las reglas oficiales de encuentros jugados. Los totales cubren solo esta página.",
  "states": {
    "disabled": "División no disponible",
    "filling": "Antes de la competición",
    "ready": "Lista para empezar",
    "in_progress": "División en curso",
    "completed": "División finalizada",
    "not_held": "División no disputada",
    "cancelled": "Evento cancelado",
    "voided": "Evento invalidado"
  }
} satisfies DictionaryShape<typeof english>;

export default dictionary;
