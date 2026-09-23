"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  getMatchRoomHistory,
  getMatchRoomEarlierHistory,
  markMatchRoomRead,
  resolveMatchRoom,
  sendAdminMatchRoomMessage,
  sendMatchRoomMessage,
} from "@/app/tournaments/room-actions";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import { getMatchRoomCopy } from "@/lib/i18n/match-room";
import { notifyMatchRoomReadAcknowledged } from "@/lib/match-room-unread-events";
import { formatDateTime } from "@/lib/i18n/format";
import {
  isMatchRoomMessageBody,
  MATCH_ROOM_MESSAGE_MAX_LENGTH,
  type MatchRoom as Room,
  type MatchRoomErrorCode,
  type MatchRoomHistory,
  type MatchRoomMessage,
  type SendMatchRoomMessageInput,
} from "@/lib/match-room";

export type MatchRoomProps = {
  matchId: string;
  /** Pin retained history; never resolve a replacement room for this link. */
  roomId?: string | null;
  participants: readonly { registrationId: string; name: string }[];
  admin?: boolean;
  footer?: (room: Room | null) => ReactNode;
};

function visibleAndOnline() {
  return document.visibilityState !== "hidden" && navigator.onLine !== false;
}

function mergeMessages(existing: MatchRoomMessage[], incoming: MatchRoomMessage[]) {
  const ids = new Set(existing.map((message) => message.id));
  const sequences = new Set(existing.map((message) => message.sequence));
  return [...existing, ...incoming.filter((message) => {
    if (ids.has(message.id) || sequences.has(message.sequence)) return false;
    ids.add(message.id);
    sequences.add(message.sequence);
    return true;
  })].sort((left, right) => left.sequence - right.sequence);
}

function mergeRoomSnapshot(previous: Room | undefined, incoming: Room): Room {
  if (!previous) return incoming;
  return {
    ...incoming,
    lastSequence: Math.max(previous.lastSequence, incoming.lastSequence),
    lastReadSequence: Math.max(previous.lastReadSequence, incoming.lastReadSequence),
    ...(previous.closedAt ? {
      closedAt: previous.closedAt, closureReason: previous.closureReason, writable: false,
    } : {}),
  };
}

export default function MatchRoom(props: MatchRoomProps) {
  // A new workspace must never render the previous workspace's transcript or draft.
  return <MatchRoomSession key={`${props.matchId}:${props.roomId ?? "current"}:${!!props.admin}`} {...props} />;
}

function MatchRoomSession({ matchId, roomId, participants, admin = false, footer }: MatchRoomProps) {
  const locale = useOptionalLocale();
  const copy = getMatchRoomCopy(locale);
  const countId = useId();
  const [history, setHistory] = useState<MatchRoomHistory | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<MatchRoomErrorCode | null>(null);
  const [sendError, setSendError] = useState<MatchRoomErrorCode | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierFailed, setEarlierFailed] = useState(false);
  const earlierCursor = useRef<number | null>(null);
  const earlierPending = useRef<object | null>(null);
  const prependAnchor = useRef<{ roomId: string; messageId: string; top: number } | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const transcriptTail = useRef<HTMLDivElement>(null);
  const tailIntersecting = useRef(false);
  const current = useRef<MatchRoomHistory | null>(null);
  const scope = useRef({ alive: false, epoch: 0, session: 0 });
  const busy = useRef(false);
  const queued = useRef(false);
  const nearBottom = useRef(true);
  const pending = useRef<SendMatchRoomMessageInput | null>(null);
  const readPending = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const [viewVersion, setViewVersion] = useState(0);

  const discardRoom = useCallback(() => {
    scope.current.epoch++;
    current.current = null;
    pending.current = null;
    readPending.current = null;
    sendingRef.current = false;
    nearBottom.current = true;
    tailIntersecting.current = false;
    setHistory(null);
    setLoaded(false);
    setDraft("");
    setSending(false);
    setSendError(null);
    setReadFailed(false);
    setNewMessages(false);
    setHasEarlier(false);
    setLoadingEarlier(false);
    setEarlierFailed(false);
    earlierCursor.current = null;
    earlierPending.current = null;
    prependAnchor.current = null;
  }, []);

  const refresh = useCallback(async function refreshRoom() {
    if (!scope.current.alive || !visibleAndOnline()) return;
    if (busy.current) {
      queued.current = true;
      return;
    }
    busy.current = true;
    const session = scope.current.session;
    let requestEpoch = scope.current.epoch;
    const isCurrentRequest = () => scope.current.alive &&
      session === scope.current.session && requestEpoch === scope.current.epoch;
    setRefreshing(true);
    try {
      let target: Room | null;
      if (roomId) {
        target = current.current?.room ?? null;
        if (!target) {
          // History itself authorizes the pinned immutable membership.
          const first = await getMatchRoomHistory({ roomId, afterSequence: 0, limit: 50 });
          if (!isCurrentRequest()) return;
          if (!first.ok) throw first.code;
          if (first.data.room.matchId !== matchId) throw "forbidden";
          target = first.data.room;
          if (target.lastSequence <= 50) {
            current.current = first.data;
            earlierCursor.current = first.data.messages[0]?.sequence ?? null;
            setHasEarlier((earlierCursor.current ?? 0) > 1);
            setHistory(first.data);
            setLoaded(true);
            setLoadError(null);
            if (target.writable) setSendError((error) => error === "disabled" ? null : error);
            return;
          }
        }
      } else {
        const result = await resolveMatchRoom({ matchId });
        if (!isCurrentRequest()) return;
        if (!result.ok) throw result.code;
        target = result.data.room;
      }

      if (current.current && current.current.room.id !== target?.id) {
        discardRoom();
        requestEpoch = scope.current.epoch;
      }
      if (!target) {
        setLoaded(true);
        setLoadError(null);
        return;
      }
      const previous = current.current;
      const afterSequence = previous?.nextAfterSequence ?? Math.max(0, target.lastSequence - 50);
      const result = await getMatchRoomHistory({ roomId: target.id, afterSequence, limit: 50 });
      if (!isCurrentRequest()) return;
      if (!result.ok) throw result.code;
      if (result.data.room.matchId !== matchId) throw "forbidden";
      const incoming = result.data;
      // An earlier page or read acknowledgement may have arrived during this poll.
      const latest = current.current;
      const messages = mergeMessages(latest?.messages ?? [], incoming.messages);
      const nextRoom = mergeRoomSnapshot(latest?.room, incoming.room);
      const next = { ...incoming, room: nextRoom, messages,
        hasMore: incoming.hasMore || incoming.nextAfterSequence < nextRoom.lastSequence };
      if (!latest) {
        earlierCursor.current = messages[0]?.sequence ?? null;
        setHasEarlier((earlierCursor.current ?? 0) > 1);
      }
      current.current = next;
      setHistory(next);
      if (previous && incoming.messages.length > 0 && !nearBottom.current) setNewMessages(true);
      setLoaded(true);
      setLoadError(null);
      if (nextRoom.writable) setSendError((error) => error === "disabled" ? null : error);
    } catch (error) {
      if (!isCurrentRequest()) return;
      const code = typeof error === "string" ? error as MatchRoomErrorCode : "unavailable";
      if (code === "forbidden" || code === "auth_required") discardRoom();
      setLoadError(code);
      setLoaded(true);
    } finally {
      busy.current = false;
      if (scope.current.alive) {
        setRefreshing(false);
        if (queued.current) {
          queued.current = false;
          void refreshRoom();
        }
      }
    }
  }, [discardRoom, matchId, roomId]);

  async function loadEarlier() {
    const previous = current.current;
    const beforeSequence = earlierCursor.current;
    if (!previous || !hasEarlier || !beforeSequence || earlierPending.current || !visibleAndOnline()) return;
    const request = {};
    const requestEpoch = scope.current.epoch;
    const session = scope.current.session;
    earlierPending.current = request;
    // Browsing older history must never acknowledge newly arriving messages.
    nearBottom.current = false;
    setLoadingEarlier(true);
    setEarlierFailed(false);
    const isCurrentRequest = () => scope.current.alive && session === scope.current.session &&
      requestEpoch === scope.current.epoch && current.current?.room.id === previous.room.id;
    try {
      const result = await getMatchRoomEarlierHistory({ roomId: previous.room.id, beforeSequence, limit: 50 });
      if (!isCurrentRequest()) return;
      if (!result.ok) throw result.code;
      if (result.data.room.matchId !== matchId || result.data.room.id !== previous.room.id) throw "forbidden";
      const latest = current.current!;
      const node = transcript.current;
      const anchor = node?.querySelector<HTMLElement>("[data-match-room-message]");
      if (anchor) prependAnchor.current = {
        roomId: previous.room.id,
        messageId: anchor.dataset.matchRoomMessage!,
        top: anchor.getBoundingClientRect().top,
      };
      nearBottom.current = false;
      const nextRoom = mergeRoomSnapshot(latest.room, result.data.room);
      const next = {
        ...latest, room: nextRoom,
        messages: mergeMessages(latest.messages, result.data.messages),
        hasMore: latest.hasMore || latest.nextAfterSequence < nextRoom.lastSequence,
      };
      earlierCursor.current = result.data.nextBeforeSequence;
      setHasEarlier(result.data.hasMore);
      current.current = next;
      setHistory(next);
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (error === "forbidden" || error === "auth_required") {
        discardRoom();
        setLoadError(error);
        setLoaded(true);
      } else {
        setEarlierFailed(true);
      }
    } finally {
      if (earlierPending.current === request) {
        earlierPending.current = null;
        if (scope.current.alive) setLoadingEarlier(false);
      }
    }
  }

  useEffect(() => {
    const lifecycle = scope.current;
    lifecycle.alive = true;
    lifecycle.session++;
    void Promise.resolve().then(refresh);
    const onReturn = () => {
      if (visibleAndOnline()) {
        setViewVersion((value) => value + 1);
        void refresh();
      }
    };
    const timer = window.setInterval(() => { if (visibleAndOnline()) void refresh(); }, 10_000);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      lifecycle.alive = false;
      lifecycle.epoch++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    const node = transcript.current;
    const anchor = prependAnchor.current;
    prependAnchor.current = null;
    if (node && anchor && anchor.roomId === history?.room.id) {
      const element = Array.from(node.querySelectorAll<HTMLElement>("[data-match-room-message]"))
        .find((message) => message.dataset.matchRoomMessage === anchor.messageId);
      if (element) node.scrollTop += element.getBoundingClientRect().top - anchor.top;
    } else if (node && nearBottom.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    const tail = transcriptTail.current;
    tailIntersecting.current = false;
    if (!tail || typeof IntersectionObserver === "undefined") return;
    // The viewport observer also respects the transcript's clipping container.
    // Merely mounting a room or polling it is not evidence that it was viewed.
    const observer = new IntersectionObserver(([entry]) => {
      tailIntersecting.current = entry.isIntersecting && entry.intersectionRatio === 1;
      if (tailIntersecting.current) setViewVersion((value) => value + 1);
    }, { threshold: 1 });
    observer.observe(tail);
    return () => {
      tailIntersecting.current = false;
      observer.disconnect();
    };
  }, [history?.room.id]);

  useEffect(() => {
    if (!history || earlierPending.current || !visibleAndOnline() || !nearBottom.current || history.hasMore) return;
    const tail = transcriptTail.current;
    const log = transcript.current;
    if (!tailIntersecting.current || !tail || !log) return;
    // Intersection callbacks are asynchronous. Recheck current layout so an old
    // visible entry cannot acknowledge a newly appended tail outside the view.
    const bounds = tail.getBoundingClientRect();
    const logBounds = log.getBoundingClientRect();
    if (bounds.height <= 0 || bounds.width <= 0 ||
        bounds.top < Math.max(0, logBounds.top) ||
        bounds.bottom > Math.min(window.innerHeight, logBounds.bottom) ||
        bounds.left < Math.max(0, logBounds.left) ||
        bounds.right > Math.min(window.innerWidth, logBounds.right)) return;
    const throughSequence = history.messages.at(-1)?.sequence ?? 0;
    if (throughSequence !== history.room.lastSequence || throughSequence <= history.room.lastReadSequence) return;
    const key = `${history.room.id}:${throughSequence}`;
    if (readPending.current) return;
    readPending.current = key;
    const requestEpoch = scope.current.epoch;
    void markMatchRoomRead({ roomId: history.room.id, throughSequence }).then((result) => {
      if (!scope.current.alive || requestEpoch !== scope.current.epoch) return;
      if (result.ok && current.current?.room.id === result.data.roomId) {
        const next = {
          ...current.current,
          room: { ...current.current.room, lastReadSequence: Math.max(
            current.current.room.lastReadSequence, result.data.lastReadSequence,
          ) },
        };
        current.current = next;
        setHistory(next);
        setReadFailed(false);
        if (!admin) notifyMatchRoomReadAcknowledged({ matchId, ...result.data });
      } else {
        setReadFailed(true);
      }
    }).catch(() => {
      if (scope.current.alive && requestEpoch === scope.current.epoch) setReadFailed(true);
    }).finally(() => {
      if (readPending.current === key) readPending.current = null;
    });
  }, [admin, history, matchId, viewVersion]);

  async function send() {
    const room = current.current?.room;
    if (!room?.writable || sendingRef.current || !isMatchRoomMessageBody(draft)) return;
    const requestEpoch = scope.current.epoch;
    const input = pending.current?.body === draft && pending.current.expectedRoomId === room.id
      ? pending.current
      : { matchId, expectedRoomId: room.id, clientMessageId: crypto.randomUUID(), body: draft };
    pending.current = input;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const result = await (admin ? sendAdminMatchRoomMessage(input) : sendMatchRoomMessage(input));
      if (!scope.current.alive || requestEpoch !== scope.current.epoch) return;
      if (!result.ok) {
        setSendError(result.code);
        if (result.code === "stale_room" || result.code === "read_only" || result.code === "disabled" ||
            result.code === "forbidden" || result.code === "auth_required") void refresh();
        return;
      }
      pending.current = null;
      setDraft("");
      nearBottom.current = true;
      setNewMessages(false);
      await refresh();
    } catch {
      if (scope.current.alive && requestEpoch === scope.current.epoch) setSendError("unavailable");
    } finally {
      if (scope.current.alive && requestEpoch === scope.current.epoch) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  function jumpToNewest() {
    nearBottom.current = true;
    setNewMessages(false);
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
    setViewVersion((value) => value + 1);
    if (history?.hasMore) void refresh();
  }

  const room = history?.room;
  const count = Array.from(draft).length;
  const errorText = (code: MatchRoomErrorCode) =>
    admin && code === "forbidden" ? copy.adminProfileRequired : copy.errors[code];
  const sendBlocked = sendError === "stale_room" || sendError === "read_only" ||
    sendError === "forbidden" || sendError === "auth_required" || sendError === "disabled";
  const buttonClass = "min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-orange-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/25 p-4 sm:p-5" aria-label={copy.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-100">{copy.title}</h3>
        <button type="button" className={buttonClass} disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? copy.refreshing : copy.refresh}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-400">{copy.privateNotice}</p>
      {loadError && <p role="alert" className="mt-3 text-sm text-amber-300">{errorText(loadError)}</p>}
      {!loaded && <p role="status" className="mt-4 text-sm text-zinc-400">{copy.loading}</p>}
      {loaded && !room && !loadError && <p className="mt-4 text-sm text-zinc-400">{copy.noRoom}</p>}
      {history && room && (
        <>
          {hasEarlier && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-500">{copy.historyNotice}</p>
              <button type="button" className={buttonClass} disabled={loadingEarlier} onClick={() => void loadEarlier()}>
                {loadingEarlier ? copy.loadingOlder : copy.loadOlder}
              </button>
            </div>
          )}
          {earlierFailed && <p role="alert" className="mt-2 text-xs text-amber-300">{copy.historyLoadFailed}</p>}
          <div
            ref={transcript}
            role="log"
            aria-label={copy.title}
            aria-live="off"
            tabIndex={0}
            className="mt-4 max-h-80 min-w-0 space-y-4 overflow-y-auto overscroll-contain [overflow-anchor:none] rounded-lg border border-zinc-800/80 p-3 [overflow-wrap:anywhere] sm:max-h-96"
            onScroll={() => {
              const node = transcript.current;
              if (!node) return;
              nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
              if (nearBottom.current) {
                setNewMessages(false);
                setViewVersion((value) => value + 1);
              }
            }}
          >
            {history.messages.length === 0 && <p className="text-sm text-zinc-500">{copy.empty}</p>}
            {history.messages.map((message) => (
              <article key={message.id} data-match-room-message={message.id} className={message.senderKind === "admin" ? "border-l-2 border-orange-500/60 pl-3" : "border-l-2 border-zinc-700 pl-3"}>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`min-w-0 text-xs font-semibold ${message.senderKind === "admin" ? "text-orange-300" : "text-zinc-200"}`}>
                    {message.senderKind === "admin" ? copy.adminLabel :
                      participants.find((participant) => participant.registrationId === message.senderRegistrationId &&
                        (participant.registrationId === room.playerOneRegistrationId ||
                         participant.registrationId === room.playerTwoRegistrationId))?.name ?? copy.participant}
                  </span>
                  <time dateTime={message.createdAt} className="text-[11px] text-zinc-500">
                    {formatDateTime(message.createdAt, locale, { kind: "local" }, { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{message.body}</p>
              </article>
            ))}
            <div ref={transcriptTail} aria-hidden="true" data-match-room-tail className="h-px" />
          </div>
          <div aria-live="polite">
          {(newMessages || history.hasMore) && (
            <button type="button" onClick={jumpToNewest} className={`mt-3 ${buttonClass}`}>{copy.newMessages}</button>
          )}
          </div>
          {readFailed && <p className="mt-2 text-xs text-zinc-500">{copy.readError}</p>}
          {!room.writable ? (
            <p className="mt-4 text-sm text-zinc-400">{room.closureReason === "lifecycle_changed" ? copy.historical : copy.readOnly}</p>
          ) : (
            <form className="mt-4 min-w-0" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label className="mb-2 block text-xs font-medium text-zinc-300">
                {copy.composerLabel}
                <textarea
                  value={draft}
                  aria-describedby={countId}
                  aria-invalid={count > MATCH_ROOM_MESSAGE_MAX_LENGTH}
                  disabled={sending}
                  onChange={(event) => { setDraft(event.target.value); }}
                  placeholder={copy.placeholder}
                  rows={3}
                  className="mt-2 block w-full min-w-0 resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none disabled:opacity-60"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span id={countId} className={`text-xs ${count > MATCH_ROOM_MESSAGE_MAX_LENGTH ? "text-amber-300" : "text-zinc-500"}`}>
                  {copy.count(count, MATCH_ROOM_MESSAGE_MAX_LENGTH)}
                </span>
                <button type="submit" disabled={sending || sendBlocked || !isMatchRoomMessageBody(draft)} className={buttonClass}>
                  {sending ? copy.sending : sendError ? copy.retry : copy.send}
                </button>
              </div>
            </form>
          )}
          {sendError && <p role="alert" className="mt-3 text-sm text-amber-300">{errorText(sendError)}</p>}
          {footer && <div className="mt-4 border-t border-zinc-800 pt-4">{footer(room)}</div>}
        </>
      )}
    </section>
  );
}
