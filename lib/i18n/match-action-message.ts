import type { MatchResultActionState } from "@/app/tournaments/match-actions";
import type { MessageValues } from "@/lib/i18n/types";
type CompetitionTranslator = (path: string, values?: MessageValues) => string;

export function getMatchActionMessage(
  state: Pick<MatchResultActionState, "code" | "message" | "values">,
  t: CompetitionTranslator
) {
  switch (state.code) {
    case "auth_required":
      return t("actionResults.authRequired");
    case "prepare_failed":
      return t("matchAction.prepareFailed");
    case "cleanup_failed":
      return t("matchAction.cleanupFailed");
    case "operation_failed":
      return t("matchAction.operationFailed");
    case "duplicate_replay":
      return t("matchAction.duplicateReplay");
    case "result_submitted":
      return t(
        Number(state.values?.warning) === 1
          ? "matchAction.resultSubmittedWarning"
          : "matchAction.resultSubmitted",
        { submission: state.values?.submission ?? "new" }
      );
    case "opponent_required":
      return t("matchAction.opponentRequired");
    case "notes_too_long":
      return t("matchAction.notesTooLong");
    case "match_unavailable":
      return t("matchAction.matchUnavailable");
    case "participants_unavailable":
      return t("matchAction.participantsUnavailable");
    case "participant_only":
      return t("matchAction.participantOnly");
    case "self_no_show":
      return t("matchAction.selfNoShow");
    case "invalid_participant":
      return t("matchAction.invalidParticipant");
    case "no_show_submitted":
      return t("matchAction.noShowSubmitted", {
        player: state.values?.player ?? "",
      });
    case "report_unavailable":
      return t("matchAction.reportUnavailable");
    case "confirmed":
      return t("matchAction.confirmed");
    case "dispute_notes_too_long":
      return t("matchAction.disputeNotesTooLong");
    case "disputed":
      return t("matchAction.disputed");
    default:
      return state.message;
  }
}
