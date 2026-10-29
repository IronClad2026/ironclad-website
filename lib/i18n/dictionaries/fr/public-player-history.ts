import type { DictionaryShape } from "@/lib/i18n/types";
import type english from "@/lib/i18n/dictionaries/en/public-player-history";

const dictionary = {
  "order": "Inscriptions les plus récentes en premier. L’historique est paginé.",
  "empty": "Aucun résultat public de tournoi pour le moment.",
  "emptyPage": "Aucun résultat public de tournoi sur cette page.",
  "unavailable": "Impossible de charger les résultats des tournois. Réessayez plus tard.",
  "division": "Division : {division}",
  "eventIncomplete": "Événement non terminé",
  "withdrawn": "Retrait",
  "champion": "Champion de division",
  "placement": "Classement final : {rank}",
  "noPlacement": "Division terminée · classement non enregistré",
  "noFinalOutcome": "Aucun résultat compétitif final",
  "resultPending": "Résultat final en attente",
  "entryRecord": "Séries officielles : {played} jouées · {wins} gagnées · {losses} perdues",
  "pagination": "Pages de l’historique des tournois",
  "previous": "Résultats plus récents",
  "next": "Résultats précédents",
  "page": "Page {page}",
  "limit": "Les résultats précédents dépassent la limite de consultation actuelle.",
  "scope": "Totaux des tournois de cette page",
  "played": "Séries officielles jouées",
  "wins": "Séries gagnées",
  "losses": "Séries perdues",
  "winRate": "Pourcentage de séries gagnées",
  "notAvailable": "—",
  "rules": "Matchs/séries officiels terminés, pas les parties individuelles. Les résultats en attente, exemptions, absences et avancements administratifs ne comptent pas comme joués. Les forfaits suivent les règles officielles des matchs joués. Les totaux concernent uniquement cette page.",
  "states": {
    "disabled": "Division indisponible",
    "filling": "Avant la compétition",
    "ready": "Prête à commencer",
    "in_progress": "Division en cours",
    "completed": "Division terminée",
    "not_held": "Division non disputée",
    "cancelled": "Événement annulé",
    "voided": "Événement invalidé"
  }
} satisfies DictionaryShape<typeof english>;

export default dictionary;

