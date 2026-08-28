import { describe, expect, it } from "vitest";

import {
  ADMIN_OPERATIONS_ERROR_MESSAGE,
  AdminOperationsMetricsError,
  buildAdminOperationsAttention,
  buildUtcDailySeries,
  calculateAdminOperationsGrowth,
  classifyAutomaticProgression,
  classifyResultResolution,
  filterLaunchedMatches,
  isActiveAdminHold,
  isAwaitingConfirmation,
  isDirectLegacyAdminResolution,
  isExpiredConfirmation,
  isFactualNoShow,
  isGenuinelyPlayedMatch,
  isOpenDispute,
  isOverdueMatchAction,
  isPlayableMatch,
  isReadyForActivation,
  isUnresolvedAdminReview,
  parseAdminOperationsPeriod,
  requireExactCount,
  resolveAdminOperationsPeriod,
  summarizeResultResolutions,
  uniqueMatchCount,
  type AdminOperationsMatchFact,
  type AdminOperationsReportGroupFact,
} from "@/lib/admin-operations-metrics";

function matchFact(
  overrides: Partial<AdminOperationsMatchFact> = {}
): AdminOperationsMatchFact {
  return {
    id: "match-1",
    status: "scheduled",
    player_one_registration_id: "registration-1",
    player_two_registration_id: "registration-2",
    player_one_score: null,
    player_two_score: null,
    winner_registration_id: null,
    official_result_submission_id: null,
    official_result_decided_by: null,
    official_result_decided_at: null,
    activation_version: 0,
    activated_at: null,
    deadline_at: null,
    outcome_type: null,
    deadline_ruled_at: null,
    hold_started_at: null,
    hold_released_at: null,
    ...overrides,
  };
}

function reportGroupFact(
  overrides: Partial<AdminOperationsReportGroupFact> = {}
): AdminOperationsReportGroupFact {
  return {
    id: "report-group-1",
    match_id: "match-1",
    result_type: "normal",
    status: "pending_confirmation",
    confirmation_deadline_at: "2026-08-19T12:00:00.000Z",
    no_show_status: null,
    finalized_at: null,
    finalized_source: null,
    ...overrides,
  };
}

describe("Admin Operations UTC periods and series", () => {
  const now = new Date("2026-08-19T17:45:30.000Z");

  it.each([
    [undefined, "30d"],
    [null, "30d"],
    ["unsupported", "30d"],
    [["7d", "today"] as string[], "7d"],
    ["today", "today"],
    ["7d", "7d"],
    ["30d", "30d"],
    ["all", "all"],
  ] as const)("parses %j as %s", (input, expected) => {
    expect(parseAdminOperationsPeriod(input)).toBe(expected);
  });

  it("uses UTC midnight and an immediately preceding comparable Today window", () => {
    expect(resolveAdminOperationsPeriod("today", now)).toEqual({
      key: "today",
      label: "Today",
      startAt: "2026-08-19T00:00:00.000Z",
      endAt: "2026-08-19T17:45:30.000Z",
      previousStartAt: "2026-08-18T06:14:30.000Z",
      previousEndAt: "2026-08-19T00:00:00.000Z",
    });
  });

  it.each([
    ["7d", "2026-08-13T00:00:00.000Z", "Last 7 days"],
    ["30d", "2026-07-21T00:00:00.000Z", "Last 30 days"],
  ] as const)("resolves %s as an inclusive UTC-day range", (period, startAt, label) => {
    const range = resolveAdminOperationsPeriod(period, now);

    expect(range.startAt).toBe(startAt);
    expect(range.endAt).toBe(now.toISOString());
    expect(range.label).toBe(label);
    expect(
      new Date(range.previousEndAt as string).getTime() -
        new Date(range.previousStartAt as string).getTime()
    ).toBe(now.getTime() - new Date(startAt).getTime());
  });

  it("leaves All time unbounded and without a fabricated comparison", () => {
    expect(resolveAdminOperationsPeriod("all", now)).toEqual({
      key: "all",
      label: "All time",
      startAt: null,
      endAt: now.toISOString(),
      previousStartAt: null,
      previousEndAt: null,
    });
  });

  it("rejects an invalid clock through the sanitized metrics error", () => {
    expect(() =>
      resolveAdminOperationsPeriod("today", new Date("invalid"))
    ).toThrowError(new AdminOperationsMetricsError());
  });

  it("buckets on UTC dates with an inclusive start and exclusive end", () => {
    const range = resolveAdminOperationsPeriod("7d", now);
    const series = buildUtcDailySeries(
      [
        "2026-08-12T23:59:59.999Z",
        "2026-08-13T00:00:00.000Z",
        "2026-08-13T21:15:00.000Z",
        "2026-08-19T17:45:29.999Z",
        "2026-08-19T17:45:30.000Z",
        null,
        "not-a-timestamp",
      ],
      range
    );

    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ date: "2026-08-13", label: "13 Aug", value: 2 });
    expect(series.at(-1)).toEqual({
      date: "2026-08-19",
      label: "19 Aug",
      value: 1,
    });
    expect(series.reduce((sum, point) => sum + point.value, 0)).toBe(3);
  });

  it("reports honest growth when a comparison is meaningful", () => {
    expect(calculateAdminOperationsGrowth(15, 10)).toEqual({
      current: 15,
      previous: 10,
      changePercent: 50,
    });
    expect(calculateAdminOperationsGrowth(0, 0).changePercent).toBe(0);
    expect(calculateAdminOperationsGrowth(4, 0).changePercent).toBeNull();
    expect(calculateAdminOperationsGrowth(4, null).changePercent).toBeNull();
  });
});

describe("Admin Operations exact-count safety", () => {
  it("preserves a real zero and a real positive exact count", () => {
    expect(requireExactCount(0, null)).toBe(0);
    expect(requireExactCount(12, null)).toBe(12);
  });

  it.each([
    [null, null],
    [0, new Error("private provider failure")],
    [-1, null],
    [1.5, null],
    [Number.MAX_SAFE_INTEGER + 1, null],
  ])("does not turn an invalid provider result into zero", (count, error) => {
    expect(() => requireExactCount(count, error)).toThrowError(
      AdminOperationsMetricsError
    );

    try {
      requireExactCount(count, error);
    } catch (caught) {
      expect(caught).toMatchObject({
        name: "AdminOperationsMetricsError",
        message: ADMIN_OPERATIONS_ERROR_MESSAGE,
      });
      expect(String(caught)).not.toContain("private provider failure");
    }
  });
});

describe("Admin Operations canonical Match predicates", () => {
  it("excludes every Match outside launched generated brackets", () => {
    const matches = [
      { id: "launched-1", generated_bracket_id: "generated-launched" },
      { id: "draft-1", generated_bracket_id: "generated-draft" },
      { id: "launched-2", generated_bracket_id: "generated-launched" },
    ];

    expect(
      filterLaunchedMatches(matches, new Set(["generated-launched"]))
    ).toEqual([matches[0], matches[2]]);
  });

  it("requires a pristine scheduled Match with both Players for activation", () => {
    expect(isReadyForActivation(matchFact())).toBe(true);
    expect(isReadyForActivation(matchFact({ player_two_registration_id: null })))
      .toBe(false);
    expect(isReadyForActivation(matchFact({ activation_version: 1 }))).toBe(false);
    expect(isReadyForActivation(matchFact({ status: "in_progress" }))).toBe(false);
    expect(isReadyForActivation(matchFact({ outcome_type: "automatic_bye" })))
      .toBe(false);
  });

  it("counts only activated, unblocked Matches before their deadline as playable now", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const playable = matchFact({
      status: "in_progress",
      activation_version: 1,
      activated_at: "2026-08-19T10:00:00.000Z",
      deadline_at: "2026-08-19T12:00:00.001Z",
    });

    expect(isPlayableMatch(playable, now, false)).toBe(true);
    expect(isPlayableMatch(matchFact(), now, false)).toBe(false);
    expect(isPlayableMatch({ ...playable, activation_version: 0 }, now, false))
      .toBe(false);
    expect(isPlayableMatch({ ...playable, activated_at: null }, now, false))
      .toBe(false);
    expect(
      isPlayableMatch({ ...playable, deadline_at: now.toISOString() }, now, false)
    ).toBe(false);
    expect(isPlayableMatch(playable, now, true)).toBe(false);
    expect(
      isPlayableMatch(
        { ...playable, hold_started_at: "2026-08-19T11:00:00.000Z" },
        now,
        false
      )
    ).toBe(false);
    expect(
      isPlayableMatch({ ...playable, outcome_type: "double_forfeit" }, now, false)
    ).toBe(false);
    expect(
      isPlayableMatch({ ...playable, winner_registration_id: "registration-1" }, now, false)
    ).toBe(false);
    expect(
      isPlayableMatch({ ...playable, player_one_registration_id: null }, now, false)
    ).toBe(false);
  });

  it("separates genuinely played Matches from no-shows and automatic outcomes", () => {
    const played = matchFact({
      status: "completed",
      player_one_score: 2,
      player_two_score: 1,
      winner_registration_id: "registration-1",
    });

    expect(isGenuinelyPlayedMatch(played, false)).toBe(true);
    expect(isGenuinelyPlayedMatch(played, true)).toBe(false);
    expect(
      isGenuinelyPlayedMatch({ ...played, outcome_type: "automatic_bye" }, false)
    ).toBe(false);
    expect(
      isGenuinelyPlayedMatch({ ...played, player_two_score: null }, false)
    ).toBe(false);
    expect(
      isGenuinelyPlayedMatch({ ...played, winner_registration_id: null }, false)
    ).toBe(false);
  });

  it("classifies automatic progression as a bye or final-round walkover", () => {
    const automatic = matchFact({
      status: "completed",
      outcome_type: "automatic_bye",
    });

    expect(classifyAutomaticProgression(automatic, false)).toBe("bye");
    expect(classifyAutomaticProgression(automatic, true)).toBe("walkover");
    expect(
      classifyAutomaticProgression(
        { ...automatic, outcome_type: "double_forfeit" },
        true
      )
    ).toBeNull();
    expect(
      classifyAutomaticProgression({ ...automatic, status: "scheduled" }, false)
    ).toBeNull();
  });

  it("classifies a direct legacy Admin result only when no report group owns it", () => {
    const directLegacy = matchFact({
      status: "completed",
      player_one_score: 2,
      player_two_score: 0,
      winner_registration_id: "registration-1",
      official_result_decided_by: "user_test_admin",
      official_result_decided_at: "2026-08-19T11:00:00.000Z",
    });

    expect(isDirectLegacyAdminResolution(directLegacy, false)).toBe(true);
    expect(isDirectLegacyAdminResolution(directLegacy, true)).toBe(false);
    expect(
      isDirectLegacyAdminResolution(
        { ...directLegacy, official_result_decided_by: null },
        false
      )
    ).toBe(false);
    expect(
      isDirectLegacyAdminResolution(
        { ...directLegacy, outcome_type: "automatic_bye" },
        false
      )
    ).toBe(false);
  });

  it("treats only unreleased holds as active", () => {
    expect(isActiveAdminHold(matchFact())).toBe(false);
    expect(
      isActiveAdminHold(
        matchFact({ hold_started_at: "2026-08-19T09:00:00.000Z" })
      )
    ).toBe(true);
    expect(
      isActiveAdminHold(
        matchFact({
          hold_started_at: "2026-08-19T09:00:00.000Z",
          hold_released_at: "2026-08-19T10:00:00.000Z",
        })
      )
    ).toBe(false);
  });

  it("identifies overdue Match actions only when no blocking result state exists", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const overdue = matchFact({
      status: "in_progress",
      activation_version: 1,
      activated_at: "2026-08-18T08:00:00.000Z",
      deadline_at: now.toISOString(),
    });

    expect(isOverdueMatchAction(overdue, [], false, now)).toBe(true);
    expect(
      isOverdueMatchAction(
        overdue,
        [reportGroupFact({ status: "disputed" })],
        false,
        now
      )
    ).toBe(false);
    expect(isOverdueMatchAction(overdue, [], true, now)).toBe(false);
    expect(
      isOverdueMatchAction(
        { ...overdue, hold_started_at: "2026-08-19T10:00:00.000Z" },
        [],
        false,
        now
      )
    ).toBe(false);
    expect(
      isOverdueMatchAction(
        { ...overdue, official_result_decided_at: now.toISOString() },
        [],
        false,
        now
      )
    ).toBe(false);
  });
});

describe("Admin Operations canonical result predicates", () => {
  it.each([
    ["confirmed", "opponent_confirmation", "player_confirmed"],
    ["auto_approved", "cron_auto_approval", "automatically_confirmed"],
    ["approved", "admin_approval", "admin_approved"],
    ["approved", "admin_override", "admin_approved"],
  ] as const)(
    "classifies %s / %s once as %s",
    (status, finalizedSource, expected) => {
      expect(
        classifyResultResolution(
          reportGroupFact({
            status,
            finalized_source: finalizedSource,
            finalized_at: "2026-08-19T10:00:00.000Z",
          })
        )
      ).toBe(expected);
    }
  );

  it("does not infer resolution from a loose status or source", () => {
    expect(
      classifyResultResolution(
        reportGroupFact({ status: "confirmed", finalized_at: null })
      )
    ).toBeNull();
    expect(
      classifyResultResolution(
        reportGroupFact({
          status: "approved",
          finalized_at: "2026-08-19T10:00:00.000Z",
          finalized_source: "opponent_confirmation",
        })
      )
    ).toBeNull();
  });

  it("deduplicates multiple finalized rows for the same Match", () => {
    const rows = [
      reportGroupFact({
        id: "report-group-old",
        status: "approved",
        finalized_at: "2026-08-19T09:00:00.000Z",
        finalized_source: "admin_approval",
      }),
      reportGroupFact({
        id: "report-group-new",
        status: "confirmed",
        finalized_at: "2026-08-19T10:00:00.000Z",
        finalized_source: "opponent_confirmation",
      }),
      reportGroupFact({
        id: "report-group-other-match",
        match_id: "match-2",
        status: "auto_approved",
        finalized_at: "2026-08-19T11:00:00.000Z",
        finalized_source: "cron_auto_approval",
      }),
    ];

    expect(
      uniqueMatchCount(
        rows.filter((row) => classifyResultResolution(row) !== null)
      )
    ).toBe(2);
    expect(summarizeResultResolutions(rows)).toEqual({
      playerConfirmed: 0,
      automaticallyConfirmed: 1,
      adminApproved: 1,
    });
    expect(
      Object.values(summarizeResultResolutions(rows)).reduce(
        (sum, value) => sum + value,
        0
      )
    ).toBe(2);
  });

  it("requires a finalized no-show with an authoritative result and no-show state", () => {
    const factualNoShow = reportGroupFact({
      result_type: "no_show",
      status: "approved",
      no_show_status: "approved",
      finalized_at: "2026-08-19T10:00:00.000Z",
      finalized_source: "admin_approval",
    });

    expect(isFactualNoShow(factualNoShow)).toBe(true);
    expect(isFactualNoShow({ ...factualNoShow, finalized_at: null })).toBe(false);
    expect(isFactualNoShow({ ...factualNoShow, result_type: "normal" })).toBe(false);
    expect(isFactualNoShow({ ...factualNoShow, no_show_status: "rejected" }))
      .toBe(false);
  });

  it("separates confirmation, dispute, and Admin-review queues", () => {
    expect(isAwaitingConfirmation(reportGroupFact())).toBe(true);
    expect(isOpenDispute(reportGroupFact({ status: "disputed" }))).toBe(true);
    expect(
      isUnresolvedAdminReview(reportGroupFact({ status: "under_review" }))
    ).toBe(true);
    expect(
      isOpenDispute(
        reportGroupFact({
          status: "disputed",
          finalized_at: "2026-08-19T10:00:00.000Z",
        })
      )
    ).toBe(false);
  });

  it("treats a pending confirmation expiring exactly now as expired", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    expect(isExpiredConfirmation(reportGroupFact(), now)).toBe(true);
    expect(
      isExpiredConfirmation(
        reportGroupFact({ confirmation_deadline_at: "2026-08-19T12:00:00.001Z" }),
        now
      )
    ).toBe(false);
    expect(
      isExpiredConfirmation(reportGroupFact({ status: "disputed" }), now)
    ).toBe(false);
  });
});

describe("Admin Operations attention queues", () => {
  it("preserves distinct actionable counts and bounded workflow links", () => {
    const attention = buildAdminOperationsAttention({
      openDisputes: 2,
      underAdminReview: 3,
      pendingAdminAssistance: 4,
      overdueMatchActions: 5,
      expiredConfirmationActions: 6,
      expiredWaitlistOffers: 7,
      activeAdminHolds: 8,
    });

    expect(attention).toHaveLength(7);
    expect(attention.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: "disputes", count: 2 },
      { key: "admin-review", count: 3 },
      { key: "admin-assistance", count: 4 },
      { key: "overdue-matches", count: 5 },
      { key: "expired-confirmations", count: 6 },
      { key: "expired-waitlist-offers", count: 7 },
      { key: "admin-holds", count: 8 },
    ]);
    expect(attention.find((item) => item.key === "expired-waitlist-offers"))
      .toMatchObject({
        href: "/admin/registrations?filter=waitlisted",
        tone: "warning",
      });
    expect(
      attention
        .filter((item) => item.key !== "expired-waitlist-offers")
        .every((item) => item.href === "/admin/operations#match-issues")
    ).toBe(true);
  });
});
