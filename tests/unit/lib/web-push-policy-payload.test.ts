import { describe, expect, it } from "vitest";

import { createWebPushPayload } from "@/lib/web-push/payload";
import {
  ADMIN_WEB_PUSH_TYPES,
  isWebPushEligible,
  PLAYER_WEB_PUSH_TYPES,
} from "@/lib/web-push/policy";

const ID = "00000000-0000-4000-8000-000000000001";

describe("Web Push eligibility and payload privacy", () => {

  it("allows message episodes only for a specific participant and a pinned room", () => {
    const input = {
      recipientRole: "player", recipientClerkUserId: "user_original",
      type: "match.message_received", eventKey: "room:episode:fixture",
      metadata: { roomId: ID },
    };
    expect(isWebPushEligible(input)).toBe(true);
    expect(isWebPushEligible({ ...input, metadata: {} })).toBe(false);
    expect(isWebPushEligible({ ...input, metadata: { roomId: "invalid" } })).toBe(false);
    expect(isWebPushEligible({ ...input, recipientClerkUserId: null })).toBe(false);
    expect(isWebPushEligible({ ...input, recipientRole: "admin", recipientClerkUserId: null })).toBe(false);
  });

  it("locks Admin Push to exactly the three approved operational types", () => {
    expect(ADMIN_WEB_PUSH_TYPES).toEqual([
      "match.dispute_opened",
      "match.no_show_disputed",
      "match.admin_assistance_requested",
    ]);

    for (const type of ADMIN_WEB_PUSH_TYPES) {
      expect(
        isWebPushEligible({
          recipientRole: "admin",
          recipientClerkUserId: null,
          type,
          eventKey: `event:${type}`,
          metadata: {},
        })
      ).toBe(true);
    }

    for (const type of ["registration.submitted", "match.result_submitted"]) {
      expect(
        isWebPushEligible({
          recipientRole: "admin",
          recipientClerkUserId: null,
          type,
          eventKey: `event:${type}`,
          metadata: {},
        })
      ).toBe(false);
    }
  });

  it("requires a stable Player event key and excludes ordinary Polls", () => {
    expect(PLAYER_WEB_PUSH_TYPES).not.toContain("registration.waitlisted");
    expect(PLAYER_WEB_PUSH_TYPES).not.toContain("registration.manual_review");
    expect(PLAYER_WEB_PUSH_TYPES).not.toContain("badge.unlocked");

    const base = {
      recipientRole: "player",
      recipientClerkUserId: "user_player",
      type: "match.confirmation_required",
      eventKey: "match:m:report-group:g:confirmation-required",
      metadata: {},
    };
    expect(isWebPushEligible(base)).toBe(true);
    expect(
      isWebPushEligible({ ...base, type: "badge.unlocked" })
    ).toBe(false);
    expect(isWebPushEligible({ ...base, eventKey: "" })).toBe(false);
    expect(
      isWebPushEligible({
        ...base,
        type: "poll.published",
        metadata: { purpose: "community_feedback" },
      })
    ).toBe(false);
    expect(
      isWebPushEligible({
        ...base,
        type: "poll.published",
        metadata: { purpose: "tournament_decision" },
      })
    ).toBe(true);
  });

  it("builds a bounded payload with no identity, arbitrary URL, or raw evidence", () => {
    const payload = createWebPushPayload({
      notificationId: ID,
      scope: "player",
      type: "match.confirmation_required",
      title: "Match result needs confirmation",
      body: "A Match result is ready for your review.",
      unreadCount: 3,
    });

    expect(payload).toEqual({
      version: 1,
      notificationId: ID,
      scope: "player",
      type: "match.confirmation_required",
      title: "Match result needs confirmation",
      body: "A Match result is ready for your review.",
      unreadCount: 3,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /clerk|steam|replay|evidence|https?:\/\//i
    );
  });

  it("rejects malformed identity, scope, count, and oversized copy", () => {
    const base = {
      notificationId: ID,
      scope: "player" as const,
      type: "match.ready",
      title: "Match ready",
      body: "Your Match is ready.",
      unreadCount: 1,
    };

    expect(() =>
      createWebPushPayload({ ...base, notificationId: "invalid" })
    ).toThrow();
    expect(() =>
      createWebPushPayload({ ...base, scope: "owner" as "player" })
    ).toThrow();
    expect(() =>
      createWebPushPayload({ ...base, unreadCount: -1 })
    ).toThrow();
    expect(() =>
      createWebPushPayload({ ...base, body: "x".repeat(181) })
    ).toThrow();
  });
});
