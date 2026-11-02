"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { readPrivateAssistance, replyPrivateAssistance } from "@/app/tournaments/private-assistance-actions";
import { setPrivateAssistanceStatus } from "@/app/admin/tournaments/assistance-actions";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import { getPrivateAssistanceCopy } from "@/lib/i18n/private-assistance";
import { formatNumber } from "@/lib/i18n/format";
import {
  ASSISTANCE_HISTORY_LIMIT,
  ASSISTANCE_MESSAGE_MAX_LENGTH,
  isAssistanceBody,
  type AssistanceConversation as Conversation,
  type AssistanceMessage,
  type AssistanceReplyInput,
  type AssistanceRequest,
  type AssistanceStatus,
} from "@/lib/private-assistance";

type Props = {
  requestId: string;
  tournamentId: string;
  onRequestChange?: (request: AssistanceRequest) => void;
  initialReplyDraft?: string;
  onReplyDraftChange?: (draft: string) => void;
  initialReplyOperation?: AssistanceReplyInput | null;
  onReplyOperationChange?: (operation: AssistanceReplyInput | null) => void;
};

export const assistanceButtonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-orange-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50";

function visible() {
  return document.visibilityState !== "hidden" && navigator.onLine !== false;
}

export default function AssistanceConversation(props: Props) {
  const { isLoaded, userId, sessionId } = useAuth();
  const copy = getPrivateAssistanceCopy(useOptionalLocale());
  if (!isLoaded || !userId) return <p role="status" className="text-sm text-zinc-400">{copy.unavailable}</p>;
  return <ConversationSession key={`${userId}:${sessionId}:${props.tournamentId}:${props.requestId}`} {...props} />;
}

function ConversationSession({ requestId, tournamentId, onRequestChange, initialReplyDraft = "", onReplyDraftChange, initialReplyOperation = null, onReplyOperationChange }: Props) {
  const locale = useOptionalLocale();
  const copy = getPrivateAssistanceCopy(locale);
  const draftId = useId();
  const [data, setData] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState(initialReplyDraft);
  const latestDraft = useRef(initialReplyDraft);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<"reply" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chosenStatus, setChosenStatus] = useState<AssistanceStatus | null>(null);
  const current = useRef<Conversation | null>(null);
  const alive = useRef(false);
  const epoch = useRef({ value: 0 });
  const reading = useRef(false);
  const mutating = useRef(false);
  const queued = useRef(false);
  const retry = useRef<AssistanceReplyInput | null>(initialReplyOperation?.requestId === requestId && initialReplyOperation.tournamentId === tournamentId ? initialReplyOperation : null);
  const notifiedVersion = useRef<number | null>(null);
  const callbacks = useRef({ onRequestChange, onReplyDraftChange, onReplyOperationChange });
  useEffect(() => { callbacks.current = { onRequestChange, onReplyDraftChange, onReplyOperationChange }; }, [onRequestChange, onReplyDraftChange, onReplyOperationChange]);

  const commit = useCallback((next: Conversation) => {
    if (next.request.contentPurgedAt) next = { ...next, messages: next.messages.map((message) => ({ ...message, body: null, redactedAt: message.redactedAt ?? next.request.contentPurgedAt })) };
    current.current = next;
    setData(next);
    if (notifiedVersion.current !== next.request.version) {
      notifiedVersion.current = next.request.version;
      callbacks.current.onRequestChange?.(next.request);
    }
  }, []);

  const refresh = useCallback(async function refreshConversation(more = false) {
    if (!alive.current || !visible() || mutating.current) return;
    if (reading.current) { queued.current = true; return; }
    reading.current = true;
    const ticket = ++epoch.current.value;
    setLoading(true);
    try {
      const previous = current.current;
      const afterSequence = more ? previous?.nextAfterSequence ?? 0 : 0;
      let result = await readPrivateAssistance({ requestId, tournamentId, afterSequence, limit: ASSISTANCE_HISTORY_LIMIT });
      if (!alive.current || ticket !== epoch.current.value) return;
      if (!result.ok) {
        if (result.code === "auth_required" || result.code === "forbidden") { current.current = null; setData(null); }
        setLoadError(copy.unavailable);
        return;
      }
      let next = result.data;
      if (next.request.id !== requestId || next.request.tournamentId !== tournamentId) {
        current.current = null; setData(null); setLoadError(copy.unavailable); return;
      }
      let messages: AssistanceMessage[] = more ? [...(previous?.messages ?? []), ...next.messages] : [...next.messages];
      // Re-read the loaded prefix, including redactions, instead of keeping old
      // message bodies indefinitely when only later pages are requested.
      const through = more ? 0 : previous?.nextAfterSequence ?? 0;
      while (next.hasMore && next.nextAfterSequence < through) {
        result = await readPrivateAssistance({ requestId, tournamentId, afterSequence: next.nextAfterSequence, limit: ASSISTANCE_HISTORY_LIMIT });
        if (!alive.current || ticket !== epoch.current.value) return;
        if (!result.ok) {
          if (result.code === "auth_required" || result.code === "forbidden") { current.current = null; setData(null); }
          setLoadError(copy.unavailable); return;
        }
        if (result.data.request.id !== requestId || result.data.request.tournamentId !== tournamentId || result.data.nextAfterSequence <= next.nextAfterSequence) {
          current.current = null; setData(null); setLoadError(copy.unavailable); return;
        }
        next = result.data;
        messages.push(...next.messages);
      }
      const unique = new Map(messages.map((message) => [message.id, message]));
      messages = [...unique.values()].sort((left, right) => left.sequence - right.sequence);
      commit({ ...next, messages });
      setLoadError(null);
    } catch {
      if (alive.current && ticket === epoch.current.value) setLoadError(copy.unavailable);
    } finally {
      reading.current = false;
      if (alive.current) {
        setLoading(false);
        if (queued.current && !mutating.current) { queued.current = false; void refreshConversation(); }
      }
    }
  }, [commit, copy.unavailable, requestId, tournamentId]);

  useEffect(() => {
    alive.current = true;
    const generation = epoch.current;
    void Promise.resolve().then(() => refresh());
    const timer = window.setInterval(() => void refresh(), 10_000);
    const onReturn = () => void refresh();
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      alive.current = false;
      generation.value++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);

  async function reply() {
    if (mutating.current || !current.current?.canReply || !isAssistanceBody(draft)) return;
    const input = retry.current?.body === draft ? retry.current : { requestId, tournamentId, clientMessageId: crypto.randomUUID(), body: draft };
    retry.current = input;
    callbacks.current.onReplyOperationChange?.(input);
    mutating.current = true;
    epoch.current.value++;
    setPending("reply"); setError(null); setNotice(null);
    try {
      const result = await replyPrivateAssistance(input);
      if (!alive.current) return;
      if (!result.ok || result.data.request.id !== requestId || result.data.request.tournamentId !== tournamentId) {
        if (!result.ok && (result.code === "auth_required" || result.code === "forbidden")) { current.current = null; setData(null); }
        setError(copy.unconfirmed); return;
      }
      if (result.data.accepted && result.data.acceptedClientMessageId === input.clientMessageId) {
        if (latestDraft.current === input.body) {
          latestDraft.current = "";
          setDraft("");
          callbacks.current.onReplyDraftChange?.("");
        }
        retry.current = null;
        callbacks.current.onReplyOperationChange?.(null);
        setNotice(copy.replySent);
      } else setError(copy.unconfirmed);
      if (current.current) commit({ ...current.current, request: result.data.request });
    } catch { if (alive.current) setError(copy.unconfirmed); }
    finally {
      mutating.current = false;
      if (alive.current) { setPending(null); void refresh(); }
    }
  }

  async function updateStatus() {
    const snapshot = current.current;
    if (mutating.current || !snapshot?.canSetStatus || !chosenStatus) return;
    mutating.current = true; epoch.current.value++;
    setPending("status"); setError(null); setNotice(null);
    try {
      const result = await setPrivateAssistanceStatus({ requestId, tournamentId, status: chosenStatus, expectedVersion: snapshot.request.version });
      if (!alive.current) return;
      if (!result.ok) {
        if (result.code === "auth_required" || result.code === "forbidden") { current.current = null; setData(null); }
        setError(result.code === "conflict" ? copy.statusConflict : copy.actionFailed); return;
      }
      if (result.data.request.id !== requestId || result.data.request.tournamentId !== tournamentId) { setError(copy.actionFailed); return; }
      commit({ ...snapshot, request: result.data.request });
      setChosenStatus(null); setNotice(copy.statusSaved);
    } catch { if (alive.current) setError(copy.actionFailed); }
    finally { mutating.current = false; if (alive.current) { setPending(null); void refresh(); } }
  }

  const statusLabel = (status: AssistanceStatus) => ({ open: copy.statusOpen, in_progress: copy.statusInProgress, resolved: copy.statusResolved })[status];
  return <section aria-label={copy.conversation} className="min-w-0 space-y-3 rounded-xl border border-white/10 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-white">{copy.conversation}</h3>
      <button type="button" className={assistanceButtonClass} disabled={loading || pending !== null} onClick={() => void refresh()}>{loading ? copy.refreshing : copy.refresh}</button>
    </div>
    <p className="text-sm text-zinc-400">{copy.privateNotice}</p>
    {data ? <>
      <p className="text-sm text-orange-200">{copy.statusLabel}: <strong>{statusLabel(data.request.status)}</strong></p>
      <p className="whitespace-pre-wrap break-words text-xs text-zinc-400">{data.request.reference}</p>
      <div role="log" aria-label={copy.messages} aria-live="polite" className="max-h-96 space-y-3 overflow-y-auto rounded-lg bg-black/25 p-3">
        {data.messages.length === 0 ? <p className="text-sm text-zinc-400">{copy.emptyMessages}</p> : data.messages.map((message) => <article key={message.id} className="min-w-0 border-b border-white/5 pb-3 last:border-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500"><strong className="text-zinc-300">{message.senderKind === "admin" ? copy.admin : data.request.requesterName || copy.requester}</strong><HydrationSafeLocalDateTime value={message.createdAt} locale={locale} fallback="—" /></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">{message.body !== null && !message.redactedAt ? message.body : copy.redacted}</p>
        </article>)}
      </div>
      {data.hasMore && <button type="button" disabled={loading || pending !== null} className={assistanceButtonClass} onClick={() => void refresh(true)}>{copy.loadEarlier}</button>}
      {data.canReply ? <form onSubmit={(event) => { event.preventDefault(); void reply(); }} className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200" htmlFor={draftId}>{copy.replyLabel}</label>
        <textarea id={draftId} value={draft} onChange={(event) => { latestDraft.current = event.target.value; setDraft(event.target.value); callbacks.current.onReplyDraftChange?.(event.target.value); }} rows={3} maxLength={ASSISTANCE_MESSAGE_MAX_LENGTH * 2} placeholder={copy.replyPlaceholder} aria-describedby={`${draftId}-count`} className="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" />
        <p id={`${draftId}-count`} className="text-xs text-zinc-500">{formatNumber(Array.from(draft).length, locale)} / {formatNumber(ASSISTANCE_MESSAGE_MAX_LENGTH, locale)} {copy.characters}</p>
        {draft && !isAssistanceBody(draft) && <p className="text-sm text-orange-200">{copy.bodyInvalid}</p>}
        {data.request.status === "resolved" && !data.canSetStatus && <p className="text-xs text-zinc-400">{copy.resolvedReply}</p>}
        <button type="submit" disabled={pending !== null || !isAssistanceBody(draft)} className={assistanceButtonClass}>{pending === "reply" ? copy.sending : copy.sendReply}</button>
      </form> : <p className="text-sm text-zinc-400">{copy.readOnly}</p>}
      {data.canSetStatus && <form onSubmit={(event) => { event.preventDefault(); void updateStatus(); }} className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
        <label className="text-sm text-zinc-300">{copy.statusLabel}<select value={chosenStatus ?? data.request.status} onChange={(event) => setChosenStatus(event.target.value as AssistanceStatus)} className="mt-1 block min-h-11 rounded-lg border border-white/15 bg-zinc-950 px-3 text-white">{(["open", "in_progress", "resolved"] as const).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <button type="submit" disabled={pending !== null || !chosenStatus || chosenStatus === data.request.status} className={assistanceButtonClass}>{pending === "status" ? copy.statusSaving : copy.statusSave}</button>
      </form>}
    </> : <p role="status" className="text-sm text-zinc-400">{loading ? copy.loading : copy.unavailable}</p>}
    {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
    {loadError && <p role="alert" className="text-sm text-orange-200">{loadError}</p>}
    {error && <p role="alert" className="text-sm text-orange-200">{error}</p>}
  </section>;
}
