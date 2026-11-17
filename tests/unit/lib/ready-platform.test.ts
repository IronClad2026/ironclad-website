import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadyOwnedMatch } from "@/lib/ready/platform-data";

const data = vi.hoisted(() => ({
  loadReadyAcceptedVersions: vi.fn(),
  loadReadyAssistanceRecord: vi.fn(),
  loadReadyEvents: vi.fn(),
  loadReadyLatestAssistance: vi.fn(),
  loadReadyMatchSettings: vi.fn(),
  loadReadyOpponent: vi.fn(),
  loadReadyOwnedMatches: vi.fn(),
  loadReadyPrivateContext: vi.fn(),
}));
vi.mock("@/lib/ready/platform-data", () => data);
vi.mock("@/lib/player-polls", () => ({ loadTournamentPollsForRequest: vi.fn() }));

import { resolveReadyAnswer } from "@/lib/ready/answer";
import { answerPlatform, answerPlatformAction, resolveReadyRuleScope } from "@/lib/ready/platform";

const MATCH = "1499cb0a-3786-401a-8de2-6c181fc7e4dd";
const EVENT = "7799cb0a-3786-401a-8de2-6c181fc7e4dd";
const ROOM = "5599cb0a-3786-401a-8de2-6c181fc7e4dd";
const ASSISTANCE = "3399cb0a-3786-401a-8de2-6c181fc7e4dd";
const REGISTRATION = "2299cb0a-3786-401a-8de2-6c181fc7e4dd";
const OPPONENT = "1199cb0a-3786-401a-8de2-6c181fc7e4dd";
const ANOTHER = "9999cb0a-3786-401a-8de2-6c181fc7e4dd";
const event = {
  id: EVENT, slug: "staging-fixture", title: "Staging fixture", status: "in_progress",
  registration_enabled: false, registration_open_at: null, registration_close_at: null,
  start_date: null, format: null, prize_pool: null,
} as const;
const match: ReadyOwnedMatch = {
  id: MATCH, match_number: 2, status: "scheduled", series_best_of: 3, activation_version: 1,
  deadline_at: "2026-11-20T22:00:00Z", hold_started_at: null, hold_released_at: null, outcome_type: null,
  player_one_registration_id: REGISTRATION, player_two_registration_id: OPPONENT,
  division: "Academy", divisionId: "6699cb0a-3786-401a-8de2-6c181fc7e4dd", deadlineManaged: true, round: 1,
  event, registrationId: REGISTRATION, opponentRegistrationId: OPPONENT, active: true,
};
const user = "user_designated_staging";

describe("Ready platform assistance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    data.loadReadyPrivateContext.mockResolvedValue({
      profile: { id: ANOTHER, profile_completed: true, account_closed_at: null },
      registrations: [{ id: REGISTRATION, tournament_id: EVENT, registration_status: "approved" }],
    });
    data.loadReadyOwnedMatches.mockResolvedValue([match]);
    data.loadReadyOpponent.mockResolvedValue("Synthetic opponent");
    data.loadReadyEvents.mockResolvedValue([event]);
    data.loadReadyAssistanceRecord.mockResolvedValue(null);
    data.loadReadyLatestAssistance.mockResolvedValue(null);
    data.loadReadyMatchSettings.mockResolvedValue({ chat: true, assistance: true });
  });

  it("offers public help but does not query private records without a session", async () => {
    await expect(answerPlatform({ question: "Who am I playing?" }, null)).resolves.toMatchObject({
      text: expect.stringContaining("Sign in"),
      actions: expect.arrayContaining([expect.objectContaining({ actionId: "sign-in", href: "/sign-in" })]),
    });
    await expect(answerPlatform({ question: "Where are the tournament rules?" }, null)).resolves.toMatchObject({
      actions: [{ label: "Open the official rules hub", href: "/rules" }],
    });
    expect(data.loadReadyPrivateContext).not.toHaveBeenCalled();
  });

  it("answers from the public edition without storing or reflecting guest match context", async () => {
    const context = { matchId: MATCH, eventSlug: "unpublished-event" };
    const signal = AbortSignal.timeout(5_000);
    const answer = await resolveReadyAnswer({ kind: "question", id: "disconnects", context }, null, signal);
    expect(answer).toMatchObject({
      text: expect.stringContaining("10:00"),
      sources: [expect.objectContaining({ title: "Official Tournament Rulebook v3.2" })],
      context: { topic: "disconnects" },
    });
    expect(JSON.stringify(answer)).not.toContain(MATCH);
    expect(JSON.stringify(answer)).not.toContain(context.eventSlug);
    expect(data.loadReadyEvents).not.toHaveBeenCalled();
    expect(data.loadReadyPrivateContext).not.toHaveBeenCalled();
    expect(data.loadReadyAcceptedVersions).not.toHaveBeenCalled();
  });

  it("uses sign-in guidance for guest personal actions without private or event reads", async () => {
    const context = { matchId: MATCH, eventSlug: "unpublished-event" };
    const signal = AbortSignal.timeout(5_000);
    for (const id of ["my-match", "opponent-chat", "registration-status", "profile-steam", "notifications",
      "history", "dashboard", "admin-assistance", "copy-match-reference"] as const) {
      const reply = await resolveReadyAnswer({ kind: "action", id, context }, null, signal);
      expect(reply).toMatchObject({
        text: expect.stringContaining("Sign in"),
        actions: expect.arrayContaining([expect.objectContaining({ href: "/sign-in" })]),
      });
      expect(JSON.stringify(reply)).not.toContain(MATCH);
      expect(JSON.stringify(reply)).not.toContain(context.eventSlug);
      expect(JSON.stringify(reply)).not.toContain("/assistance/");
    }
    expect(data.loadReadyPrivateContext).not.toHaveBeenCalled();
    expect(data.loadReadyEvents).not.toHaveBeenCalled();
    expect(data.loadReadyAssistanceRecord).not.toHaveBeenCalled();
  });

  it("exposes a public tournament link only after the public event lookup verifies its scope", async () => {
    const signal = AbortSignal.timeout(5_000);
    const reply = await resolveReadyAnswer({ kind: "action", id: "find-tournament", context: { eventSlug: event.slug, matchId: MATCH } },
      null, signal);
    expect(reply).toMatchObject({
      context: { eventSlug: event.slug, topic: "event" },
      actions: [expect.objectContaining({ href: `/tournaments?tournament=${event.slug}` })],
    });
    expect(JSON.stringify(reply)).not.toContain(MATCH);
    data.loadReadyEvents.mockResolvedValueOnce([]);
    const unavailable = await resolveReadyAnswer({ kind: "action", id: "find-tournament", context: { eventSlug: "unpublished-event" } },
      null, signal);
    expect(unavailable).toMatchObject({ actions: [expect.objectContaining({ href: "/tournaments" })], fallback: true });
    expect(JSON.stringify(unavailable)).not.toContain("unpublished-event");
    expect(data.loadReadyPrivateContext).not.toHaveBeenCalled();
  });

  it("renders authorised opponents and paused deadlines from current records", async () => {
    await expect(answerPlatform({ question: "Who am I playing?" }, user)).resolves.toMatchObject({
      text: expect.stringContaining("Synthetic opponent"),
      context: { topic: "match", eventSlug: event.slug, matchId: MATCH },
    });
    expect(data.loadReadyOpponent).toHaveBeenCalledWith(match);
    data.loadReadyOwnedMatches.mockResolvedValue([{ ...match, hold_started_at: "2026-11-17T17:00:00Z" }]);
    await expect(answerPlatform({ question: "When is my match deadline?" }, user)).resolves.toMatchObject({
      text: expect.stringContaining("deadline is paused"),
    });
  });

  it("does not open a match when a supplied identifier is excluded from the owned projection", async () => {
    data.loadReadyOwnedMatches.mockResolvedValue([]);
    const reply = await answerPlatform({ question: "Open my match", context: { matchId: ANOTHER } }, user);
    expect(data.loadReadyOwnedMatches).toHaveBeenCalledWith(expect.any(Object), ANOTHER);
    expect(reply?.text).toContain("couldn’t find that match under your current account");
    expect(reply?.actions).not.toEqual(expect.arrayContaining([{ label: "Open my match", href: expect.any(String) }]));
    expect(data.loadReadyAssistanceRecord).not.toHaveBeenCalled();
  });

  it("asks the caller to choose when more than one current assignment exists", async () => {
    data.loadReadyOwnedMatches.mockResolvedValue([match, { ...match, id: ANOTHER, match_number: 3 }]);
    const reply = await answerPlatform({ question: "Open my match" }, user);
    expect(reply?.text).toContain("Which one");
    expect(reply?.actions).toEqual([
      expect.objectContaining({ intent: { kind: "action", id: "my-match" }, context: { topic: "match", eventSlug: event.slug, matchId: MATCH } }),
      expect.objectContaining({ intent: { kind: "action", id: "my-match" }, context: { topic: "match", eventSlug: event.slug, matchId: ANOTHER } }),
    ]);
  });

  it("navigates to existing Match Room and preserves read-only historical targeting", async () => {
    const input = { question: "Open the chat with my opponent", context: { matchId: MATCH } };
    await expect(answerPlatform(input, user)).resolves.toMatchObject({
      actions: [{ label: "Open opponent chat", href: `/tournaments?tournament=${event.slug}&tab=brackets&match=${MATCH}` }],
    });
    data.loadReadyOwnedMatches.mockResolvedValue([{ ...match, active: false, status: "completed" }]);
    data.loadReadyAssistanceRecord.mockResolvedValue({ id: ASSISTANCE, room_id: ROOM });
    await expect(answerPlatform(input, user)).resolves.toMatchObject({
      text: expect.stringContaining("read-only"),
      actions: [{ label: "Open earlier Match Room", href: `/tournaments?tournament=${event.slug}&tab=brackets&match=${MATCH}&room=${ROOM}` }],
    });
  });

  it("gives the operator-verified Discord panel, server invitation and own in-site request", async () => {
    data.loadReadyAssistanceRecord.mockResolvedValue({ id: ASSISTANCE, room_id: ROOM });
    const reply = await answerPlatform({ question: "I need an admin", context: { matchId: MATCH } }, user);
    expect(reply?.text).toContain("press the ticket button");
    expect(reply?.actions).toEqual([
      expect.objectContaining({ actionId: "admin-assistance", href: `/assistance/${ASSISTANCE}?tournament=${EVENT}` }),
      expect.objectContaining({ actionId: "discord-ticket", href: "https://discord.com/channels/1440092095619662105/1440201093110960137" }),
      expect.objectContaining({ actionId: "discord-invite", href: "https://discord.gg/ZQSQjBNRm3" }),
      expect.objectContaining({ actionId: "copy-match-reference", copyText: expect.stringContaining(MATCH) }),
    ]);
  });

  it("fails closed when live reads fail instead of guessing assignment or status", async () => {
    data.loadReadyOwnedMatches.mockRejectedValue(new Error("no data"));
    await expect(answerPlatform({ question: "When is my match deadline?" }, user)).resolves.toMatchObject({
      text: expect.stringContaining("couldn’t verify"),
    });
    expect(data.loadReadyOpponent).not.toHaveBeenCalled();
  });

  it("uses the selected event's own historical acceptance rather than substituting the current document", async () => {
    const versions = { rulebook: "3.0", ppa: "3.0", terms: "1.0", privacy: "1.2" };
    data.loadReadyAcceptedVersions.mockResolvedValue(versions);
    await expect(resolveReadyRuleScope({ eventSlug: event.slug }, user)).resolves.toEqual({
      kind: "known", eventTitle: event.title, versions,
    });
    data.loadReadyAcceptedVersions.mockResolvedValue(null);
    await expect(resolveReadyRuleScope({ eventSlug: event.slug }, user)).resolves.toEqual({
      kind: "unconfirmed", eventTitle: event.title,
    });
  });

  it("uses the exact owned match's event and acceptance when the question only supplies a match", async () => {
    const versions = { rulebook: "3.0", ppa: "3.0", terms: "1.0", privacy: "1.2" };
    data.loadReadyAcceptedVersions.mockResolvedValue(versions);
    await expect(resolveReadyRuleScope({ matchId: MATCH }, user, "What are the applicable rules?")).resolves.toEqual({
      kind: "known", eventTitle: event.title, versions,
    });
    expect(data.loadReadyEvents).not.toHaveBeenCalled();
    expect(data.loadReadyAcceptedVersions).toHaveBeenCalledWith(expect.objectContaining({ id: REGISTRATION }), user);
  });

  it("rejects an unowned match or contradictory event scope without loading any acceptance", async () => {
    await expect(resolveReadyRuleScope({ matchId: ANOTHER, eventSlug: event.slug }, user)).resolves.toEqual({ kind: "unconfirmed" });
    await expect(resolveReadyRuleScope({ matchId: MATCH, eventSlug: "different-event" }, user)).resolves.toEqual({ kind: "unconfirmed" });
    expect(data.loadReadyAcceptedVersions).not.toHaveBeenCalled();
  });

  it("offers only owned event choices when asked about the caller's tournament", async () => {
    const other = { ...event, id: ANOTHER, slug: "second-fixture", title: "Second fixture" };
    data.loadReadyEvents.mockResolvedValue([event, other, { ...event, id: ROOM, slug: "unrelated" }]);
    data.loadReadyPrivateContext.mockResolvedValue({
      profile: { id: ASSISTANCE, account_closed_at: null, profile_completed: true },
      registrations: [{ tournament_id: EVENT }, { tournament_id: ANOTHER }],
    });
    await expect(resolveReadyRuleScope(undefined, user, "Which rules apply to my tournament?")).resolves.toEqual({
      kind: "unconfirmed", events: [{ title: event.title, slug: event.slug }, { title: other.title, slug: other.slug }],
    });
    expect(data.loadReadyAcceptedVersions).not.toHaveBeenCalled();
  });

  it("uses the same owned registration check for a direct governing-edition request", async () => {
    const versions = { rulebook: "3.0", ppa: "3.0", terms: "1.0", privacy: "1.2" };
    data.loadReadyAcceptedVersions.mockResolvedValue(versions);
    const identity = { userId: user, sessionId: "fixture-session" };
    const signal = AbortSignal.timeout(5_000);
    const answer = await resolveReadyAnswer({ kind: "question", id: "division", context: { matchId: MATCH } }, identity, signal);
    expect(answer).toMatchObject({
      text: expect.stringContaining("combined Main / Pro"),
      sources: [{ title: "Official Tournament Rulebook v3.0" }],
      intent: { kind: "question", id: "division" },
    });

    data.loadReadyAcceptedVersions.mockClear();
    data.loadReadyOwnedMatches.mockResolvedValue([]);
    await expect(resolveReadyAnswer({ kind: "question", id: "division", context: { matchId: ANOTHER } }, identity, signal))
      .resolves.toMatchObject({ text: expect.stringContaining("can’t confirm"), fallback: true });
    expect(data.loadReadyAcceptedVersions).not.toHaveBeenCalled();
  });

  it("dispatches direct match actions by ID and respects workspace restrictions", async () => {
    await expect(answerPlatformAction("opponent-chat", { matchId: MATCH }, user)).resolves.toMatchObject({
      actions: [{ actionId: "opponent-chat", destinationType: "match", href: expect.stringContaining(`match=${MATCH}`) }],
    });
    data.loadReadyOwnedMatches.mockResolvedValue([{ ...match, hold_started_at: "2026-11-17T17:00:00Z" }]);
    await expect(answerPlatformAction("submit-result", { matchId: MATCH }, user)).resolves.toMatchObject({
      text: expect.stringContaining("deadline is paused"),
      actions: [{ actionId: "my-match" }],
    });
    const reference = await answerPlatformAction("copy-match-reference", { matchId: MATCH }, user);
    expect(reference.actions).toEqual([expect.objectContaining({
      actionId: "copy-match-reference", destinationType: "copy_reference", copyText: expect.stringContaining(MATCH),
    })]);
  });

  it("serves the caller's waitlist state and only uses established platform destinations", async () => {
    data.loadReadyPrivateContext.mockResolvedValue({
      profile: { id: ANOTHER, profile_completed: true, account_closed_at: null },
      registrations: [{
        id: REGISTRATION, tournament_id: EVENT, registration_status: "waitlisted", waitlist_offer_status: "offered",
        waitlist_offer_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      }],
    });
    await expect(answerPlatformAction("registration-status", undefined, user)).resolves.toMatchObject({
      text: expect.stringContaining("recorded waitlist offer expires"),
      actions: [{ href: "/dashboard" }, { href: "/tournaments?tournament=staging-fixture" }],
    });
    for (const [id, href] of [
      ["profile-steam", "/profile"], ["notifications", "/dashboard#player-notifications"],
      ["history", "/dashboard#dashboard-history"], ["rankings", "/rankings"],
    ] as const) {
      await expect(answerPlatformAction(id, undefined, user)).resolves.toMatchObject({
        actions: expect.arrayContaining([expect.objectContaining({ actionId: id, href })]),
      });
    }
  });
});
