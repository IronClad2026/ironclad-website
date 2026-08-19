import { describe, expect, it } from "vitest";

import notificationsEnglish from "@/lib/i18n/dictionaries/en/notifications";
import { localizePlayerNotificationCopy } from "@/lib/i18n/notification-copy";

const KNOWN_TYPES = [
  "tournament.cancelled",
  "tournament.voided",
  "registration.approved",
  "registration.promoted",
  "registration.waitlist_offer",
  "registration.waitlist_closed",
  "registration.rejected",
  "registration.waitlisted",
  "registration.manual_review",
  "match.ready",
  "match.automatic_advance",
  "match.deadline_updated",
  "match.deadline_reminder",
  "match.deadline_ruling",
  "match.confirmation_required",
  "match.result_submitted",
  "match.no_show_reported",
  "match.no_show_confirmed",
  "match.no_show_disputed",
  "match.no_show_approved",
  "match.no_show_rejected",
  "match.no_show_review_required",
  "match.result_approved",
  "match.result_review_required",
  "poll.published",
  "poll.decision_published",
] as const;

describe("localized notification copy", () => {
  it.each(KNOWN_TYPES)("renders known type %s from stable type data", (type) => {
    const copy = localizePlayerNotificationCopy(
      { type, tournamentTitle: "Admin Authored Cup" },
      notificationsEnglish
    );

    expect(copy?.title.trim()).not.toBe("");
    expect(copy?.message).toContain("Admin Authored Cup");
  });

  it("keeps unknown and historical notification prose as the caller fallback", () => {
    expect(
      localizePlayerNotificationCopy(
        { type: "legacy.unknown", tournamentTitle: "Legacy Cup" },
        notificationsEnglish
      )
    ).toBeNull();
  });
});
