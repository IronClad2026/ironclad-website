import {
  DEFAULT_BADGES_DICTIONARY,
  getLocalizedBadgeDefinition,
  type BadgesDictionary,
} from "@/lib/i18n/badges";
import type { NotificationsDictionary } from "@/lib/i18n/dictionaries/en/notifications";
import { interpolateMessage } from "@/lib/i18n/translate";

type LocalizedNotificationCopy = {
  title: string;
  message: string;
};

type NotificationCopyInput = {
  type: string;
  tournamentTitle: string | null;
  metadata?: Record<string, unknown> | null;
};

function template(
  dictionary: NotificationsDictionary,
  titleKey: keyof NotificationsDictionary["server"],
  messageKey: keyof NotificationsDictionary["server"],
  tournamentName: string
): LocalizedNotificationCopy {
  return {
    title: dictionary.server[titleKey],
    message: interpolateMessage(dictionary.server[messageKey], {
      tournamentName,
    }),
  };
}

export function localizePlayerNotificationCopy(
  input: NotificationCopyInput,
  dictionary: NotificationsDictionary,
  badgesDictionary: BadgesDictionary = DEFAULT_BADGES_DICTIONARY
): LocalizedNotificationCopy | null {
  const tournamentName =
    input.tournamentTitle?.trim() || dictionary.server.tournamentFallback;

  switch (input.type) {
    case "badge.unlocked": {
      const badge = getLocalizedBadgeDefinition(
        badgesDictionary,
        input.metadata?.badgeSlug
      );

      return badge
        ? {
            title: dictionary.server.badgeUnlockedTitle,
            message: interpolateMessage(
              dictionary.server.badgeUnlockedMessage,
              { badgeName: badge.name }
            ),
          }
        : null;
    }
    case "tournament.cancelled":
      return template(
        dictionary,
        "tournamentCancelledTitle",
        "tournamentCancelledMessage",
        tournamentName
      );
    case "tournament.voided":
      return template(
        dictionary,
        "tournamentVoidedTitle",
        "tournamentVoidedMessage",
        tournamentName
      );
    case "registration.approved":
    case "registration.promoted":
      return template(
        dictionary,
        "registrationApprovedTitle",
        "registrationApprovedMessage",
        tournamentName
      );
    case "registration.waitlist_offer":
      return template(
        dictionary,
        "waitlistOfferTitle",
        "waitlistOfferMessage",
        tournamentName
      );
    case "registration.waitlist_closed":
      return template(
        dictionary,
        "waitlistClosedTitle",
        "waitlistClosedMessage",
        tournamentName
      );
    case "registration.rejected":
      return template(
        dictionary,
        "registrationRejectedTitle",
        "registrationRejectedMessage",
        tournamentName
      );
    case "registration.waitlisted":
      return template(
        dictionary,
        "registrationWaitlistedTitle",
        "registrationWaitlistedMessage",
        tournamentName
      );
    case "registration.manual_review":
      return template(
        dictionary,
        "registrationReviewTitle",
        "registrationReviewMessage",
        tournamentName
      );
    case "match.ready":
      return template(
        dictionary,
        "matchReadyTitle",
        "matchReadyMessage",
        tournamentName
      );
    case "match.automatic_advance":
      return template(
        dictionary,
        "automaticAdvanceTitle",
        "automaticAdvanceMessage",
        tournamentName
      );
    case "match.deadline_updated":
      return template(
        dictionary,
        "deadlineUpdatedTitle",
        "deadlineUpdatedMessage",
        tournamentName
      );
    case "match.deadline_reminder":
      return template(
        dictionary,
        "deadlineReminderTitle",
        "deadlineReminderMessage",
        tournamentName
      );
    case "match.deadline_ruling":
      return template(
        dictionary,
        "deadlineRulingTitle",
        "deadlineRulingMessage",
        tournamentName
      );
    case "match.confirmation_required":
      return template(
        dictionary,
        "confirmationRequiredTitle",
        "confirmationRequiredMessage",
        tournamentName
      );
    case "match.result_submitted":
      return template(
        dictionary,
        "resultSubmittedTitle",
        "resultSubmittedMessage",
        tournamentName
      );
    case "match.no_show_reported":
      return template(
        dictionary,
        "noShowReportedTitle",
        "noShowReportedMessage",
        tournamentName
      );
    case "match.no_show_confirmed":
      return template(
        dictionary,
        "noShowConfirmedTitle",
        "noShowConfirmedMessage",
        tournamentName
      );
    case "match.no_show_disputed":
      return template(
        dictionary,
        "noShowDisputedTitle",
        "noShowDisputedMessage",
        tournamentName
      );
    case "match.no_show_approved":
      return template(
        dictionary,
        "noShowApprovedTitle",
        "noShowApprovedMessage",
        tournamentName
      );
    case "match.no_show_rejected":
      return template(
        dictionary,
        "noShowRejectedTitle",
        "noShowRejectedMessage",
        tournamentName
      );
    case "match.no_show_review_required":
      return template(
        dictionary,
        "noShowReviewTitle",
        "noShowReviewMessage",
        tournamentName
      );
    case "match.result_approved":
      return template(
        dictionary,
        "resultApprovedTitle",
        "resultApprovedMessage",
        tournamentName
      );
    case "match.result_review_required":
      return template(
        dictionary,
        "resultReviewTitle",
        "resultReviewMessage",
        tournamentName
      );
    case "poll.published":
      return template(
        dictionary,
        "pollPublishedTitle",
        "pollPublishedMessage",
        tournamentName
      );
    case "poll.decision_published":
      return template(
        dictionary,
        "decisionPublishedTitle",
        "decisionPublishedMessage",
        tournamentName
      );
    default:
      return null;
  }
}
