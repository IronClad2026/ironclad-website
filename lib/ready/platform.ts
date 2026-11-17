import "server-only";

import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { getRequestLocale } from "@/lib/i18n/request";
import { loadTournamentPollsForRequest } from "@/lib/player-polls";
import { VERIFIED_DISCORD_TICKET_URL } from "@/lib/support";
import { getTournamentRegistrationAvailability } from "@/lib/tournaments";
import type { ReadyAction, ReadyContext, ReadyReply, ReadyRequest } from "./contracts";
import { readyLink } from "./catalogue";
import type { ReadyActionId } from "./catalogue";
import {
  loadReadyAcceptedVersions,
  loadReadyAssistanceRecord,
  loadReadyEvents,
  loadReadyLatestAssistance,
  loadReadyMatchSettings,
  loadReadyOpponent,
  loadReadyOwnedMatches,
  loadReadyPrivateContext,
  type ReadyEvent,
  type ReadyOwnedMatch,
} from "./platform-data";

type MatchIntent = "match" | "opponent" | "deadline" | "chat" | "result" | "replay" | "support";
type EventIntent = "event" | "register" | "prizes" | "decisions" | "event-rules";
type PlatformIntent = MatchIntent | EventIntent | "rules";
type Intent = PlatformIntent | "private";

export type ReadyRuleScope =
  | { kind: "general" }
  | { kind: "known"; eventTitle: string; versions: { rulebook: string; ppa: string; terms: string; privacy: string } }
  | { kind: "unconfirmed"; eventTitle?: string; events?: { title: string; slug: string }[] };

const tournaments = readyLink("find-tournament", "Browse tournaments", "/tournaments");
const rules = readyLink("rules-hub", "Open the official rules hub", "/rules");
const signIn = readyLink("sign-in", "Sign in", "/sign-in");
const dashboard = readyLink("dashboard", "Open dashboard", "/dashboard");
const invite = readyLink("discord-invite", "Join the IronClad Discord server", "https://discord.gg/ZQSQjBNRm3");
const eventIntents = new Set<PlatformIntent>(["event", "register", "prizes", "decisions", "event-rules"]);
const platformActions: Partial<Record<ReadyActionId, PlatformIntent>> = {
  "my-match": "match", opponent: "opponent", "opponent-chat": "chat", deadline: "deadline", bracket: "match", "past-match": "match",
  "submit-result": "result", "upload-replays": "replay",
  "find-tournament": "event", "open-registration": "register", "registration-status": "register",
  "event-rules": "event-rules", "event-prizes": "prizes", "event-decisions": "decisions", "rules-hub": "rules",
  "admin-assistance": "support", "support-options": "support", "copy-match-reference": "support",
};
const legacyActions: Record<PlatformIntent, ReadyActionId> = {
  match: "my-match", opponent: "opponent", deadline: "deadline", chat: "opponent-chat", result: "submit-result",
  replay: "upload-replays", support: "support-options", event: "find-tournament", register: "open-registration",
  prizes: "event-prizes", decisions: "event-decisions", "event-rules": "event-rules", rules: "rules-hub",
};
const pickAction = (id: ReadyActionId, label: string, context?: ReadyContext): ReadyAction => ({
  label, intent: { kind: "action", id }, context,
});

function inferIntent(question: string, context?: ReadyContext): Intent | null {
  const q = question.toLowerCase().replaceAll("’", "'");
  if (/\b(?:someone else's|another (?:player|account|user)|other (?:player'?s|account'?s|user'?s))\b/.test(q) &&
      /\b(?:match|chat|transcript|personal|private|account|identity|deadline)\b/.test(q)) return "private";
  if (/\b(?:contact an? admin|need an? admin|admin assistance|open (?:a )?(?:support )?ticket|discord (?:support|ticket)|get (?:an? admin|support)|contact support)\b/.test(q)) return "support";
  if (/\b(?:opponent chat|match room|chat with (?:my|the) opponent|open (?:my|the) chat)\b/.test(q)) return "chat";
  if (/\b(?:who am i playing|who is my opponent|my opponent|who do i play)\b/.test(q)) return "opponent";
  if (/\b(?:my (?:match )?deadline|when (?:is|does) (?:my|the) match (?:deadline|end)|deadline for my match|when do i play)\b/.test(q)) return "deadline";
  if (/\b(?:open|show|find|where is|what is) (?:my|the) (?:next |previous |last )?match\b|^(?:my|next|previous|last) match[?!.]?$/.test(q)) return "match";
  if (/\b(?:submit|report|enter)\b.*\b(?:result|score)\b/.test(q)) return "result";
  if (/\b(?:upload|attach)\b.*\breplays?\b|\bwhere are (?:my|the) replays?\b/.test(q)) return "replay";
  if (/\b(?:register|registration|sign up)\b/.test(q) &&
      /\b(?:can(?:'t|not)? i|why|how do i|register for|registration (?:open|window|status)|open registration|sign up)\b/.test(q)) return "register";
  if (/\b(?:prize pool|prize terms|event prizes|tournament prizes)\b/.test(q) &&
      (context?.eventSlug || /\b(?:this|that|my|for|pool)\b/.test(q))) return "prizes";
  if (/\b(?:published (?:decision|vote)|(?:event|tournament) decisions?)\b/.test(q)) return "decisions";
  if (/\b(?:rules hub|where (?:are|is|can i (?:find|read)) (?:the )?(?:tournament rules|rulebook)|open (?:the )?rules)\b/.test(q)) {
    return context?.eventSlug && /\b(?:my|this|event)\b/.test(q) ? "event-rules" : "rules";
  }
  if (/\b(?:next (?:event|tournament)|(?:open|browse|find|show) (?:the )?(?:tournaments?|events?))\b/.test(q)) return "event";
  if (/^(?:and )?(?:when|what(?:'s| about the)) (?:is (?:it|that) due|the deadline|deadline)[?!.]?$/.test(q) &&
      (context?.matchId || context?.topic === "match")) return "deadline";
  return null;
}

function dateLabel(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}

function eventHref(event: ReadyEvent, params: Record<string, string> = {}) {
  return "/tournaments?" + new URLSearchParams({ tournament: event.slug, ...params }).toString();
}

function matchHref(match: ReadyOwnedMatch, roomId?: string) {
  return eventHref(match.event, { tab: "brackets", match: match.id, ...(roomId ? { room: roomId } : {}) });
}

function assistanceLink(requestId: string, tournamentId: string): ReadyAction {
  return readyLink("admin-assistance", "Open your Admin Assistance conversation", `/assistance/${requestId}?tournament=${tournamentId}`);
}

function eventTitle(event: ReadyEvent) {
  return event.title.trim().slice(0, 96);
}

function matchLabel(match: ReadyOwnedMatch) {
  return (match.round === null ? "" : `Round ${match.round} · `) + `Match ${match.match_number}`;
}

function canUseMatchRoom(match: ReadyOwnedMatch) {
  return !!match.opponentRegistrationId && match.active;
}

function supportLinks(): ReadyReply & { actions: ReadyAction[] } {
  const actions: ReadyAction[] = VERIFIED_DISCORD_TICKET_URL
    ? [readyLink("discord-ticket", "Open Discord ticket channel", VERIFIED_DISCORD_TICKET_URL), invite]
    : [invite];
  return {
    text: VERIFIED_DISCORD_TICKET_URL
      ? "Open the Discord support channel and press the ticket button in the support panel. Include your event, match and a short description. Join the server first if needed."
      : "I can share the server invitation, Commander. I can’t confirm a ticket-channel link right now.",
    actions,
  };
}

const workflows = {
  result: "In your tournament’s Brackets tab, open your match and use its result form. Enter the series score, attach the required replays and review before submitting.",
  replay: "Open your match in your tournament’s Brackets tab. Use the replay upload fields in its result form for the games played, then review before submitting.",
};

export async function answerPlatform(input: ReadyRequest, userId: string | null): Promise<ReadyReply | null> {
  const intent = inferIntent(input.question, input.context);
  if (!intent) return null;
  if (intent === "private") {
    return { text: "I can only look up matches and match rooms that belong to your signed-in account, Commander.", fallback: true };
  }
  const id = intent === "match" && /\b(?:previous|last|historical|past|completed)\b/i.test(input.question)
    ? "past-match" : legacyActions[intent];
  return answerPlatformIntent(intent, id, input, userId);
}

export async function answerPlatformAction(id: ReadyActionId, context: ReadyContext | undefined, userId: string | null): Promise<ReadyReply> {
  if (id === "discord-ticket") return supportLinks();
  if (id === "discord-invite") return { text: "Join the official IronClad server to access its support channels.", actions: [invite] };
  if (!userId && (id === "profile-steam" || id === "notifications" || id === "history" || id === "statistics" || id === "dashboard")) {
    return { text: "Sign in to see your own player information, Commander.", actions: [signIn] };
  }
  if (id === "profile-steam") return {
    text: "Open your player profile to edit your details and check your Steam connection.",
    actions: [readyLink(id, "Open Profile & Steam", "/profile")],
  };
  if (id === "notifications") return {
    text: "Your IronClad notifications are in the Dashboard’s competition updates.",
    actions: [readyLink(id, "Open my notifications", "/dashboard#player-notifications")],
  };
  if (id === "history" || id === "statistics") return {
    text: "Your Dashboard shows your own Career history and performance statistics.",
    actions: [readyLink("history", "Open my history", "/dashboard#dashboard-history"),
      readyLink("statistics", "Open my statistics", "/dashboard#dashboard-statistics")],
  };
  if (id === "rankings") return {
    text: "The Rankings page shows the published competition standings and points.",
    actions: [readyLink(id, "Open rankings", "/rankings")],
  };
  if (id === "dashboard") return { text: "Open your player Dashboard.", actions: [dashboard] };
  if (id === "sign-in") return { text: "Sign in to see your player information, Commander.", actions: [signIn] };
  const intent = platformActions[id];
  if (!intent) return { text: "That action isn’t available, Commander.", actions: [rules], fallback: true };
  return answerPlatformIntent(intent, id, { question: "", context }, userId);
}

async function answerPlatformIntent(intent: PlatformIntent, id: ReadyActionId, input: ReadyRequest, userId: string | null) {
  if (intent === "rules") {
    return {
      text: "The official rules hub links the Rulebook, Player Participation Agreement, Terms and Privacy Policy.",
      actions: [rules],
      sources: [{ title: "IronClad Official Rules Hub", url: "https://www.ironcladtournaments.com/rules", section: "Official and legal documents" }],
    };
  }
  try {
    return eventIntents.has(intent)
      ? await answerEvent(intent as EventIntent, id, input, userId)
      : await answerMatch(intent as MatchIntent, id, input, userId);
  } catch {
    if (intent === "support") return { ...supportLinks(), fallback: true };
    return {
      text: "I couldn’t verify the current platform information, Commander. Try the platform page or ask an admin.",
      actions: [intent === "register" || eventIntents.has(intent) ? tournaments : dashboard,
        pickAction("support-options", "Contact an admin")],
      fallback: true,
    };
  }
}

async function answerMatch(intent: MatchIntent, actionId: ReadyActionId, input: ReadyRequest, userId: string | null): Promise<ReadyReply> {
  const workflow = intent === "result" || intent === "replay" ? workflows[intent] + " " : "";
  if (!userId) {
    if (actionId === "copy-match-reference") {
      return { text: "Sign in to find a reference for your own match, Commander.", actions: [signIn, tournaments], fallback: true };
    }
    if (intent === "support") {
      const support = supportLinks();
      return { text: "Sign in to access your own in-site Admin Assistance. " + support.text, actions: [signIn, ...support.actions] };
    }
    return { text: workflow + "Sign in to look up your own match, Commander.", actions: [signIn, tournaments], fallback: true };
  }
  const owned = await loadReadyPrivateContext(userId);
  if (!owned.profile) {
    if (intent === "support") return supportLinks();
    return { text: workflow + "I couldn’t verify an active player profile for your account, Commander.", actions: [dashboard], fallback: true };
  }

  const context = input.context;
  const matches = (await loadReadyOwnedMatches(owned, context?.matchId))
    .filter((match) => !context?.eventSlug || [match.event.slug, match.event.id].includes(context.eventSlug));
  const named = matches.filter((match) => refersToEvent(input.question, match.event));
  const scoped = named.length ? named : matches;
  const historical = actionId === "past-match" || /\b(?:previous|last|historical|past|completed)\b/i.test(input.question);
  const current = scoped.filter((match) => match.active);
  const explicit = !!(context?.matchId || context?.eventSlug || named.length);
  const selected = historical ? scoped.filter((match) => !match.active)
    : context?.matchId || (explicit && !current.length) ? scoped : current;
  if (!selected.length) {
    if (intent === "support") {
      const result = supportLinks();
      if (actionId === "copy-match-reference") return {
        text: "I couldn’t find a match reference for your selection, Commander.",
        actions: [dashboard, ...result.actions], fallback: true,
      };
      const latest = !explicit ? await loadReadyLatestAssistance(owned.profile.id) : null;
      if (latest) result.actions.unshift(assistanceLink(latest.id, latest.tournamentId));
      return { ...result, fallback: true };
    }
    const scopedMessage = explicit
      ? "I couldn’t find that match under your current account."
      : "I found no active match assigned to your account.";
    return {
      text: workflow + scopedMessage,
      actions: [dashboard, ...(matches.some((match) => !match.active) && !context?.matchId
        ? [pickAction("past-match", "Find a past match")] : [])],
      fallback: true,
    };
  }
  if (selected.length > 1) {
    const support = intent === "support" ? supportLinks() : null;
    const limit = support ? 3 : 5;
    return {
      text: "I found more than one match under your account. Which one should I use?" + (support ? " " + support.text : ""),
      actions: [...selected.slice(0, limit).map((match) =>
        pickAction(actionId, `${eventTitle(match.event)} · ${matchLabel(match)}`,
          { topic: "match", eventSlug: match.event.slug, matchId: match.id })),
        ...(selected.length > limit ? [dashboard] : []), ...(support?.actions ?? [])],
    };
  }

  const match = selected[0];
  const replyContext = { topic: "match", eventSlug: match.event.slug, matchId: match.id };
  const href = matchHref(match);
  const openMatch = readyLink("my-match", "Open my match", href);
  const header = `${eventTitle(match.event)} · ${matchLabel(match)}`;
  const held = match.hold_started_at !== null && match.hold_released_at === null;
  const copy = {
    label: "Copy match reference", copyText: `${header} · ${match.id}`,
    actionId: "copy-match-reference", destinationType: "copy_reference",
  } as const;
  if (actionId === "copy-match-reference") return {
    text: `Copy this match reference to give the team the right match, Commander. ${header}.`,
    actions: [copy], context: replyContext,
  };
  if (actionId === "bracket") return {
    text: `Open Brackets for ${eventTitle(match.event)}, Commander.`,
    actions: [readyLink("bracket", "Open my bracket", eventHref(match.event, { tab: "brackets" }))],
    context: replyContext,
  };
  if (intent === "opponent") {
    const opponent = await loadReadyOpponent(match);
    return {
      text: opponent ? `${match.active ? "Your opponent is" : "The recorded opponent was"} ${opponent}. ${header}.`
        : `There’s no opponent assigned yet for ${header}.`,
      actions: [openMatch], context: replyContext,
      fallback: !opponent,
    };
  }
  if (intent === "deadline") {
    const deadline = dateLabel(match.deadline_at);
    const state = held ? "The deadline is paused. Check the Match workspace for updates."
      : deadline ? `${match.active ? "The current deadline is" : "The recorded deadline was"} ${deadline}.`
        : "There’s no confirmed match deadline in the current record.";
    return { text: `${state} Match status is ${match.status.replaceAll("_", " ")}. ${header}.`, actions: [openMatch], context: replyContext };
  }
  if (intent === "chat" || intent === "support") {
    const record = await loadReadyAssistanceRecord(match, owned.profile.id);
    const settings = await loadReadyMatchSettings();
    if (intent === "chat") {
      if (settings.chat && canUseMatchRoom(match)) {
        return { text: `Open the Match Room for ${header}.`, actions: [readyLink("opponent-chat", "Open opponent chat", href)], context: replyContext };
      }
      if (record) {
        return { text: "The earlier Match Room can be opened as read-only.",
          actions: [readyLink("opponent-chat", "Open earlier Match Room", matchHref(match, record.room_id))], context: replyContext };
      }
      return {
        text: !match.opponentRegistrationId ? "This match does not have an assigned opponent yet."
          : settings.chat ? "This match is no longer active. Open its workspace to see any existing read-only room."
          : "Match Room activity is currently disabled. An existing room may be available as read-only.",
        actions: [openMatch], context: replyContext, fallback: true,
      };
    }
    const support = supportLinks();
    if (record) {
      support.actions.unshift(assistanceLink(record.id, match.event.id));
    } else if (settings.assistance && settings.chat && canUseMatchRoom(match)) {
      support.actions.unshift(readyLink("admin-assistance", "Open Match Room for Admin Assistance", href));
      support.text += " In the Match Room’s Get help section, select Message IronClad admins to start an in-site request.";
    }
    return {
      ...support,
      actions: [...support.actions, copy],
      context: replyContext,
    };
  }
  if (workflow && !match.active) {
    return { text: "This match is no longer active. Open its workspace to view the existing result and any replays available to you.", actions: [openMatch], context: replyContext };
  }
  if (workflow && !match.opponentRegistrationId) return {
    text: "This match has no assigned opponent yet. Check its workspace before preparing a result or replay submission.",
    actions: [openMatch], context: replyContext, fallback: true,
  };
  if (workflow && (held || match.status === "pending_review" || (match.deadlineManaged &&
      (match.status === "scheduled" || !match.deadline_at || Date.parse(match.deadline_at) <= Date.now())))) {
    const restriction = held ? "This match’s deadline is paused."
      : match.status === "pending_review" ? "This match already has a result pending review."
      : "The result window is not open for this match.";
    return {
      text: `${restriction} Open your Match workspace to check its current status, Commander.`,
      actions: [openMatch], context: replyContext,
    };
  }
  const status = match.status.replaceAll("_", " ");
  const detail = match.opponentRegistrationId ? `Match status is ${status}.` : "An opponent has not been assigned.";
  const resultLink = intent === "result" ? readyLink("submit-result", "Open result workspace", href)
    : intent === "replay" ? readyLink("upload-replays", "Open replay workspace", href) : openMatch;
  return { text: workflow + `${header}. ${detail}`, actions: [resultLink], context: replyContext };
}

function refersToEvent(question: string, event: ReadyEvent) {
  const value = question.toLowerCase();
  const title = event.title.toLowerCase();
  return (title.length >= 6 && value.includes(title)) || (event.slug.length >= 6 && value.includes(event.slug.toLowerCase()));
}

async function answerEvent(intent: EventIntent, actionId: ReadyActionId, input: ReadyRequest, userId: string | null): Promise<ReadyReply> {
  if (actionId === "registration-status" && !userId) {
    return { text: "Sign in to see your own tournament registrations and waitlist status, Commander.", actions: [signIn, tournaments], fallback: true };
  }
  const reference = input.context?.eventSlug;
  const events = await loadReadyEvents(reference);
  const named = events.filter((event) => refersToEvent(input.question, event));
  const active = events.filter((event) => event.status === "upcoming" || event.status === "registration_open" || event.status === "in_progress");
  const owned = actionId === "registration-status" && userId ? await loadReadyPrivateContext(userId) : null;
  const scope = reference ? events : named.length ? named : active;
  const scoped = actionId === "registration-status"
    ? scope.filter((event) => owned?.registrations.some((registration) => registration.tournament_id === event.id))
    : scope;
  if (!scoped.length) {
    return {
      text: actionId === "registration-status" ? "I couldn’t find a registration for that selection. Check your Dashboard for your current registrations, Commander."
        : reference ? "I couldn’t verify that event. Open Tournaments to choose an available event."
        : "There’s no upcoming or open event in the current list. The Tournaments page has the available event history.",
      actions: [actionId === "registration-status" ? dashboard : tournaments],
      fallback: true,
    };
  }
  if (scoped.length > 1) {
    return {
      text: "Which event do you mean, Commander?",
      actions: [...scoped.slice(0, 5).map((event) =>
        pickAction(actionId, eventTitle(event), { eventSlug: event.slug, topic: "event" })), tournaments],
    };
  }
  const event = scoped[0];
  const title = eventTitle(event);
  const context = { topic: "event", eventSlug: event.slug };
  const open = readyLink("find-tournament", "Open tournament", eventHref(event));
  if (actionId === "registration-status") {
    const registration = owned?.registrations.find((entry) => entry.tournament_id === event.id);
    if (!registration) return { text: "I couldn’t confirm a registration for this event.", actions: [dashboard], fallback: true };
    const expires = registration.waitlist_offer_status === "offered" ? dateLabel(registration.waitlist_offer_expires_at) : null;
    const offer = expires && registration.waitlist_offer_expires_at && Date.parse(registration.waitlist_offer_expires_at) > Date.now()
      ? ` Your recorded waitlist offer expires on ${expires}. Check the Dashboard to review it.` : "";
    return {
      text: `Your registration for ${title} is ${registration.registration_status.replaceAll("_", " ")}.${offer}`,
      actions: [dashboard, open], context,
    };
  }
  if (intent === "event-rules") {
    return { text: `The tournament page shows the published event settings for ${title}. The official rules hub lists the governing documents.`,
      actions: [readyLink("event-rules", "Open event rules", eventHref(event, { panel: "rules" })), rules], context };
  }
  if (intent === "decisions") {
    const result = await loadTournamentPollsForRequest([event.id], false);
    if (result.error) throw new Error("Ready decisions unavailable");
    const published = result.pollsByTournament[event.id]?.find((poll) => poll.finalDecisionPublishedAt);
    return {
      text: published ? `A final decision is published for ${title}. Open the Decisions tab for the outcome and its authority.`
        : `I couldn’t find a published final decision for ${title}. The Decisions tab shows the current record.`,
      actions: [readyLink("event-decisions", "Open event decisions", eventHref(event, { tab: "decisions", ...(published ? { poll: published.id } : {}) }))], context,
    };
  }
  if (intent === "prizes") {
    return {
      text: event.prize_pool?.trim()
        ? `The event lists this prize pool: ${event.prize_pool.trim().slice(0, 110)}. Check the Prizes panel for the published terms.`
        : `I couldn’t verify a listed prize pool for ${title}.`,
      actions: [readyLink("event-prizes", "Open event prize terms", eventHref(event, { panel: "prizes" }))], context,
    };
  }
  if (intent === "register") {
    const availability = getTournamentRegistrationAvailability({
      statusValue: event.status,
      registrationEnabled: event.registration_enabled,
      registrationOpenAt: event.registration_open_at,
      registrationCloseAt: event.registration_close_at,
    });
    if (availability !== "open") {
      const opens = dateLabel(event.registration_open_at);
      const scheduled = availability === "scheduled" && opens;
      return { text: scheduled ? `${title} is scheduled to open for registration on ${opens}.`
        : `${title} isn’t taking registrations at the moment.`, actions: [open], context };
    }
    if (!userId) return { text: `Sign in to check your eligibility for ${title}.`, actions: [signIn, open], context };
    const owned = await loadReadyPrivateContext(userId);
    if (!owned.profile?.profile_completed) {
      return { text: "Complete your player profile before entering the registration workflow.", actions: [dashboard, open], context };
    }
    const registration = owned.registrations.find((row) => row.tournament_id === event.id);
    if (registration) {
      return { text: `Your current registration status for ${title} is ${registration.registration_status.replaceAll("_", " ")}.`, actions: [dashboard, open], context };
    }
    if (await getRequestLocale() !== "en") {
      return { text: "Switch the site language to English before registering. The current registration form uses the governing English documents.", actions: [open], context };
    }
    const legal = await loadAccountLegalGateState();
    if (legal.status === "required") {
      return { text: "Review the current Terms and Privacy notice in your account before registering.", actions: [dashboard, open], context };
    }
    if (legal.status !== "satisfied") throw new Error("Ready legal acceptance unavailable");
    return {
      text: `The event’s registration window is open for ${title}. The registration form checks your current division and eligibility.`,
      actions: [readyLink("open-registration", "Open registration", eventHref(event, { register: "1" }))],
      context,
    };
  }
  const date = dateLabel(event.start_date);
  return { text: `${title} is ${event.status.replaceAll("_", " ")}.${date ? ` Its listed start is ${date}.` : ""}`, actions: [open], context };
}

export async function resolveReadyRuleScope(
  context: ReadyContext | undefined, userId: string | null, question = "", requireOwnedEvent = false,
): Promise<ReadyRuleScope> {
  const ownScope = requireOwnedEvent || /\b(?:my|this|that) (?:event|tournament|division|match)\b/i.test(question);
  const namedScope = /\b(?:for|during|in) (?:the )?(?:event|tournament|season)\b/i.test(question);
  const eventRequired = !!(context?.eventSlug || context?.matchId) || ownScope || namedScope;
  if (!eventRequired) return { kind: "general" };
  try {
    const owned = userId ? await loadReadyPrivateContext(userId) : null;
    let event: ReadyEvent;
    let matchRegistrationId: string | undefined;
    if (context?.matchId) {
      if (!owned?.profile) return { kind: "unconfirmed" };
      const match = (await loadReadyOwnedMatches(owned, context.matchId))
        .find((candidate) => candidate.id === context.matchId?.toLowerCase());
      if (!match || (context.eventSlug && ![match.event.slug, match.event.id].includes(context.eventSlug))) {
        return { kind: "unconfirmed" };
      }
      event = match.event;
      matchRegistrationId = match.registrationId;
    } else {
      const events = await loadReadyEvents(context?.eventSlug);
      const named = events.filter((candidate) => refersToEvent(question, candidate));
      const ownedEventIds = new Set(owned?.registrations.map((entry) => entry.tournament_id));
      const confirmed = context?.eventSlug ? events : named.length || namedScope ? named : events.filter((candidate) =>
        ["registration_open", "in_progress", "upcoming"].includes(candidate.status) &&
        ownedEventIds.has(candidate.id));
      const relevant = ownScope ? confirmed.filter((candidate) => ownedEventIds.has(candidate.id)) : confirmed;
      if (relevant.length > 1) {
        return { kind: "unconfirmed", events: relevant.slice(0, 5).map((candidate) => ({
          title: eventTitle(candidate), slug: candidate.slug,
        })) };
      }
      if (!relevant.length) return { kind: "unconfirmed" };
      event = relevant[0];
    }
    const registration = owned?.registrations.find((entry) => entry.tournament_id === event.id &&
      (!matchRegistrationId || entry.id === matchRegistrationId));
    const versions = registration && userId ? await loadReadyAcceptedVersions(registration, userId) : null;
    return versions
      ? { kind: "known", eventTitle: eventTitle(event), versions }
      : { kind: "unconfirmed", eventTitle: eventTitle(event) };
  } catch {
    return { kind: "unconfirmed" };
  }
}
