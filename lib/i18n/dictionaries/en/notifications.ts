import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  center: {
    eyebrow: "Notifications",
    totalSummary: "{total} total · {unread} unread",
    selectAll: "Select all",
    selected: "{count} selected",
    markSelectedRead: "Mark selected read",
    deleteSelected: "Delete selected",
    markAllRead: "Mark all read",
    selectNotification: "Select {title}",
    new: "New",
    deadline: "Deadline: {value}",
    selectMatchConfirmation: "Select match result confirmation notification",
    noShowConfirmationTitle: "No-show confirmation required",
    resultConfirmationTitle: "Match result confirmation required",
    noShowConfirmationMessage:
      "Your opponent reported a no-show for {tournamentName}.",
    resultConfirmationMessage:
      "Your opponent submitted a result for {tournamentName}. Reported score: {score}.",
    openToRespond: "Open the tournament to confirm or dispute",
    unknownTime: "Unknown time",
    pushTitle: "Device notifications",
    pushDescription:
      "Allow meaningful IronClad alerts on this device. Nothing is requested until you choose Enable.",
    pushChecking: "Checking this device's notification status…",
    pushEnable: "Enable notifications",
    pushDisable: "Disable on this device",
    pushEnabling: "Enabling…",
    pushDisabling: "Disabling…",
    pushEnabled: "Notifications are enabled on this device.",
    pushDisabled: "Notifications are off on this device.",
    pushBlocked:
      "Notifications are blocked in your browser or device settings.",
    pushInstallRequired:
      "On iPhone or iPad, install IronClad on your Home Screen before enabling notifications.",
    pushUnsupported: "This browser does not support Web Push.",
    pushUnavailable: "Notifications could not be updated. Please try again.",
    pushPrivacy:
      "Alerts may appear on your lock screen. Keep notification previews private in your device settings.",
  },
  dashboard: {
    title: "Notifications",
    noMessages: "No match messages",
    messageOne: "1 match message",
    messageFew: "{count} match messages",
    messageMany: "{count} match messages",
    messageOther: "{count} match messages",
    actionRequiredOne: "1 requires action",
    actionRequiredFew: "{count} require action",
    actionRequiredMany: "{count} require action",
    actionRequiredOther: "{count} require action",
    empty:
      "Match submissions and administrator decisions will appear here.",
    clearSelection: "Clear selection",
    selectAll: "Select all",
    deleteSelected: "Delete selected",
    deleteAll: "Delete all",
    updating: "Updating notifications…",
    selectNotification: "Select notification {label}",
    deleteNotification: "Delete notification {label}",
    close: "Close notification",
    modalEyebrow: "Match notification",
    opponent: "Opponent",
    report: "Report",
    score: "Score",
    time: "Time",
    unavailable: "Unavailable",
    noShowForfeit: "No-show / forfeit",
    disputeNotes: "Optional dispute notes",
    confirmNoShow: "Confirm no-show",
    confirmResult: "Confirm result",
    disputeNoShow: "Dispute no-show",
    disputeResult: "Dispute result",
    tournament: "Tournament",
    match: "Match",
    matchValue: "{roundName} · Match {matchNumber}",
    submission: "Submission",
    forfeitWinner: "Forfeit winner",
    reportedWinner: "Reported winner",
    missingPlayer: "Missing player",
    reportedLoser: "Reported loser",
    reportType: "Report type",
    reportedScore: "Reported score",
    status: "Status",
    timeRemaining: "Time remaining",
    reviewed: "Reviewed",
    submitted: "Submitted",
    administratorMessage: "Administrator message",
    expiredNotice:
      "The confirmation window has expired. Automatic approval is waiting for the scheduled process.",
    noShowReport: "No-show report",
    submissionNumber: "Submission #{number}",
    resultConfirmation: "Result confirmation",
    timeUnavailable: "Time remaining unavailable",
    expired: "Expired · awaiting automation",
    hoursRemaining: "{hours}h {minutes}m remaining",
    minutesRemaining: "{minutes}m {seconds}s remaining",
    secondsRemaining: "{seconds}s remaining",
    actions: {
      signInRequired: "Sign in before managing Match notifications.",
      selectionRequired: "Select at least one notification.",
      updateFailed: "Your notifications could not be updated.",
      unavailable: "No player notifications are available.",
      notificationUnavailable:
        "One or more notifications are no longer available.",
      alreadyDeleted: "All notifications are already deleted.",
      deletedOne: "1 notification deleted.",
      deletedFew: "{count} notifications deleted.",
      deletedMany: "{count} notifications deleted.",
      deletedOther: "{count} notifications deleted.",
      resultUnavailable: "The Match-result confirmation could not be found.",
      confirmFailed: "The Match result could not be confirmed. Please try again.",
      confirmed: "Result confirmed. The Bracket has been updated.",
      disputeNotesTooLong:
        "Dispute notes must be 2,000 characters or fewer.",
      disputeFailed: "The Match result could not be disputed. Please try again.",
      disputed: "Result disputed. An administrator must review it.",
    },
  },
  status: {
    pending: "Under review",
    approved: "Approved",
    rejected: "Rejected",
    resubmissionRequested: "Resubmission requested",
    pendingConfirmation: "Pending opponent confirmation",
    confirmed: "Confirmed",
    autoApproved: "Auto-approved",
    disputed: "Disputed",
    underReview: "Under review",
    reset: "Reset",
  },
  matchContent: {
    noShowAwaitingTitle: "No-show report awaiting confirmation",
    noShowAwaitingMessage:
      "Your no-show report was submitted. Your opponent must confirm or dispute it before the deadline.",
    submissionAwaitingTitle: "Submission #{number} awaiting confirmation",
    submissionAwaitingMessage:
      "Your match result was submitted. Your opponent must confirm or dispute it before the deadline.",
    noShowConfirmationTitle: "No-show confirmation required",
    noShowConfirmationMessage:
      "Your opponent reported you as a no-show in {tournamentName}. Confirm or dispute the report before the confirmation window expires.",
    resultConfirmationTitle: "Match result confirmation required",
    resultConfirmationMessage:
      "Your opponent submitted the result for your match in {tournamentName}. Confirm or dispute it before the confirmation window expires.",
    noShowApprovedTitle: "No-show report approved",
    noShowApprovedMessage: "The no-show report was approved and recorded.",
    resultApprovedTitle: "Match result approved",
    resultApprovedMessage: "The official result was approved and recorded.",
    noShowConfirmedTitle: "No-show confirmed",
    noShowConfirmedMessage: "The no-show report was confirmed and recorded.",
    resultConfirmedTitle: "Match result confirmed",
    resultConfirmedMessage:
      "The result was confirmed by the opponent and recorded.",
    noShowAutoTitle: "No-show automatically confirmed",
    noShowAutoMessage:
      "The confirmation window expired without a dispute, so the no-show was automatically confirmed.",
    resultAutoTitle: "Match result automatically approved",
    resultAutoMessage:
      "The confirmation window expired without a dispute, so the result was automatically approved.",
    noShowRejectedTitle: "No-show report rejected",
    noShowRejectedMessage:
      "The no-show report was rejected. Review the administrator message before continuing.",
    resultRejectedTitle: "Match result rejected",
    resultRejectedMessage:
      "Review the administrator message before submitting corrected evidence.",
    noShowDisputedTitle: "No-show disputed",
    noShowDisputedMessage:
      "This no-show report was disputed and now requires administrator review.",
    resultDisputedTitle: "Match result disputed",
    resultDisputedMessage:
      "This result was disputed and now requires administrator review.",
    noShowReviewTitle: "No-show under review",
    noShowReviewMessage: "An administrator is reviewing this no-show dispute.",
    resultReviewTitle: "Match result under review",
    resultReviewMessage: "An administrator is reviewing this disputed result.",
    resubmissionTitle: "Result resubmission requested",
    resubmissionMessage:
      "An administrator requires a corrected result or additional proof.",
    resetTitle: "Match result reset",
    resetMessage: "The result report was reset and the match remains unresolved.",
    submittedReviewTitle: "Submission #{number} is under review",
    submittedReviewMessage: "Your match result was submitted successfully.",
    opponentSubmittedTitle: "Your opponent submitted a match result",
    opponentSubmittedMessage:
      "The reported result is under administrator review. Open this message to inspect the report.",
  },
  server: {
    loadError: "Notifications could not be loaded.",
    tournamentFallback: "this IronClad tournament",
    tournamentCancelledTitle: "Tournament cancelled",
    tournamentCancelledMessage:
      "{tournamentName} was cancelled. Your registration is closed and no official competitive result was recorded.",
    tournamentVoidedTitle: "Tournament voided",
    tournamentVoidedMessage:
      "{tournamentName} was voided. Its competition history remains available, but its results no longer count toward IronClad standings.",
    registrationApprovedTitle: "Registration approved",
    registrationApprovedMessage:
      "Your registration for {tournamentName} has been approved.",
    waitlistOfferTitle: "A tournament place is available",
    waitlistOfferMessage:
      "A place is available in {tournamentName}. Open your dashboard to accept or decline it before the offer expires.",
    waitlistClosedTitle: "Waitlist closed",
    waitlistClosedMessage:
      "The waitlist for {tournamentName} is now closed.",
    registrationRejectedTitle: "Registration not approved",
    registrationRejectedMessage:
      "Your registration for {tournamentName} was not approved.",
    registrationWaitlistedTitle: "Added to the waitlist",
    registrationWaitlistedMessage:
      "Your registration for {tournamentName} is on the waitlist.",
    registrationReviewTitle: "Registration under review",
    registrationReviewMessage:
      "Your registration for {tournamentName} requires administrator review.",
    matchReadyTitle: "Match ready",
    matchReadyMessage: "Your next match in {tournamentName} is ready.",
    automaticAdvanceTitle: "Automatic advancement",
    automaticAdvanceMessage:
      "Your bracket position in {tournamentName} advanced automatically.",
    deadlineUpdatedTitle: "Match deadline updated",
    deadlineUpdatedMessage:
      "The deadline status for your match in {tournamentName} has changed.",
    deadlineReminderTitle: "Match deadline reminder",
    deadlineReminderMessage:
      "Your match in {tournamentName} is approaching its deadline.",
    deadlineRulingTitle: "Match deadline ruling",
    deadlineRulingMessage:
      "An official deadline ruling was recorded for your match in {tournamentName}.",
    confirmationRequiredTitle: "Match result confirmation required",
    confirmationRequiredMessage:
      "Open your match in {tournamentName} to confirm or dispute the reported result.",
    resultSubmittedTitle: "Match result submitted",
    resultSubmittedMessage:
      "A match result in {tournamentName} is awaiting confirmation or review.",
    noShowReportedTitle: "No-show reported",
    noShowReportedMessage:
      "A no-show report in {tournamentName} is awaiting confirmation or review.",
    noShowConfirmedTitle: "No-show confirmed",
    noShowConfirmedMessage:
      "The no-show report in {tournamentName} was confirmed.",
    noShowDisputedTitle: "No-show disputed",
    noShowDisputedMessage:
      "The no-show report in {tournamentName} requires administrator review.",
    noShowApprovedTitle: "No-show approved",
    noShowApprovedMessage:
      "The no-show report in {tournamentName} was approved and recorded.",
    noShowRejectedTitle: "No-show rejected",
    noShowRejectedMessage:
      "The no-show report in {tournamentName} was rejected.",
    noShowReviewTitle: "No-show report requires review",
    noShowReviewMessage:
      "The no-show report in {tournamentName} requires administrator review.",
    resultApprovedTitle: "Match result approved",
    resultApprovedMessage:
      "The match result in {tournamentName} was approved and recorded.",
    resultReviewTitle: "Match result requires review",
    resultReviewMessage:
      "The match result in {tournamentName} requires administrator review.",
    pollPublishedTitle: "Your vote is requested",
    pollPublishedMessage:
      "A poll is available for you in {tournamentName}. Open it to view the source-language question and vote.",
    decisionPublishedTitle: "Published decision",
    decisionPublishedMessage:
      "A decision has been published for {tournamentName}. Open it to read the source-language decision.",
  },
} as const;
export type NotificationsDictionary = DictionaryShape<typeof dictionary>;
export default dictionary;
