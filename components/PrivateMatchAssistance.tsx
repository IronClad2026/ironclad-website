"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getPrivateAssistanceContext, openPrivateAssistance } from "@/app/tournaments/private-assistance-actions";
import AssistanceConversation, { assistanceButtonClass } from "@/components/AssistanceConversation";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import { getPrivateAssistanceCopy } from "@/lib/i18n/private-assistance";
import { formatNumber } from "@/lib/i18n/format";
import {
  ASSISTANCE_MESSAGE_MAX_LENGTH,
  isAssistanceBody,
  type AssistanceContext,
  type AssistanceOpenInput,
  type AssistanceRequest,
} from "@/lib/private-assistance";

export default function PrivateMatchAssistance({ roomId }: { roomId: string }) {
  const { isLoaded, userId, sessionId } = useAuth();
  const copy = getPrivateAssistanceCopy(useOptionalLocale());
  if (!isLoaded) return <p role="status" className="text-sm text-zinc-400">{copy.loading}</p>;
  if (!userId) return <p role="status" className="text-sm text-zinc-400">{copy.unavailable}</p>;
  return <PrivateAssistanceSession key={`${userId}:${sessionId}:${roomId}`} roomId={roomId} />;
}

function PrivateAssistanceSession({ roomId }: { roomId: string }) {
  const locale = useOptionalLocale();
  const copy = getPrivateAssistanceCopy(locale);
  const fieldId = useId();
  const [context, setContext] = useState<AssistanceContext | null>(null);
  const [draft, setDraft] = useState("");
  const [showPrivate, setShowPrivate] = useState(false);
  const [showDiscord, setShowDiscord] = useState(false);
  const [pending, setPending] = useState(false);
  const [recoveringOpen, setRecoveringOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const current = useRef<AssistanceContext | null>(null);
  const alive = useRef(false);
  const epoch = useRef({ value: 0 });
  const mutating = useRef(false);
  const reading = useRef(false);
  const retry = useRef<AssistanceOpenInput | null>(null);

  const refresh = useCallback(async () => {
    if (!alive.current || reading.current || mutating.current || document.visibilityState === "hidden" || navigator.onLine === false) return;
    reading.current = true;
    const ticket = ++epoch.current.value;
    setLoading(true);
    try {
      const result = await getPrivateAssistanceContext({ roomId });
      if (!alive.current || ticket !== epoch.current.value) return;
      if (!result.ok || result.data.room.roomId !== roomId) {
        if (result.ok || result.code === "forbidden" || result.code === "auth_required") { current.current = null; setContext(null); setRecoveringOpen(false); }
        setError(copy.unavailable); return;
      }
      let next = result.data;
      const original = retry.current;
      if (next.request && original) {
        // A lost create response must be reconciled using its original UUID.
        // Offering this body as a fresh reply could duplicate the first message.
        setRecoveringOpen(true);
        current.current = next;
        setContext(next);
        const recovered = await openPrivateAssistance(original);
        if (!alive.current || ticket !== epoch.current.value) return;
        if (!recovered.ok || recovered.data.request.id !== next.request.id || recovered.data.request.roomId !== roomId || recovered.data.request.tournamentId !== next.room.tournamentId) {
          if (!recovered.ok && (recovered.code === "forbidden" || recovered.code === "auth_required")) { current.current = null; setContext(null); setRecoveringOpen(false); }
          setError(copy.unconfirmed); return;
        }
        if (recovered.data.accepted && recovered.data.acceptedClientMessageId === original.clientMessageId) {
          setDraft((value) => value === original.body ? "" : value);
          setNotice(copy.requestSent);
        } else if (!recovered.data.accepted) {
          setNotice(copy.existingConversation);
        } else { setError(copy.unconfirmed); return; }
        retry.current = null;
        setRecoveringOpen(false);
        next = { ...next, request: recovered.data.request, canCreate: false };
      }
      current.current = next;
      setContext(next);
      setError(null);
    } catch { if (alive.current && ticket === epoch.current.value) setError(retry.current ? copy.unconfirmed : copy.unavailable); }
    finally { reading.current = false; if (alive.current) setLoading(false); }
  }, [copy.existingConversation, copy.requestSent, copy.unavailable, copy.unconfirmed, roomId]);

  useEffect(() => {
    alive.current = true;
    const generation = epoch.current;
    void Promise.resolve().then(() => refresh());
    const checkContext = () => { if (!current.current?.request || retry.current) void refresh(); };
    const timer = window.setInterval(checkContext, 10_000);
    window.addEventListener("focus", checkContext);
    window.addEventListener("online", checkContext);
    document.addEventListener("visibilitychange", checkContext);
    return () => {
      alive.current = false; generation.value++;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkContext);
      window.removeEventListener("online", checkContext);
      document.removeEventListener("visibilitychange", checkContext);
    };
  }, [refresh]);

  const updateRequest = useCallback((request: AssistanceRequest) => {
    if (!alive.current || !current.current || request.roomId !== roomId || request.tournamentId !== current.current.room.tournamentId) return;
    const next = { ...current.current, request, canCreate: false };
    current.current = next;
    setContext(next);
  }, [roomId]);

  async function open() {
    if (!context?.canCreate || mutating.current || reading.current || !isAssistanceBody(draft)) return;
    const input = retry.current?.body === draft ? retry.current : { roomId, clientMessageId: crypto.randomUUID(), body: draft };
    retry.current = input;
    mutating.current = true; epoch.current.value++;
    setPending(true); setError(null); setNotice(null);
    try {
      const result = await openPrivateAssistance(input);
      if (!alive.current) return;
      if (!result.ok || result.data.request.roomId !== roomId || result.data.request.tournamentId !== context.room.tournamentId) {
        if (!result.ok && (result.code === "forbidden" || result.code === "auth_required")) { current.current = null; setContext(null); }
        setError(copy.unconfirmed); return;
      }
      updateRequest(result.data.request);
      if (result.data.accepted && result.data.acceptedClientMessageId !== input.clientMessageId) {
        setRecoveringOpen(true);
        setError(copy.unconfirmed);
        return;
      }
      setRecoveringOpen(false);
      if (result.data.accepted && result.data.acceptedClientMessageId === input.clientMessageId) {
        setDraft((value) => value === input.body ? "" : value);
        retry.current = null;
        setNotice(copy.requestSent);
      } else { retry.current = null; setNotice(copy.existingConversation); }
    } catch { if (alive.current) setError(copy.unconfirmed); }
    finally { mutating.current = false; if (alive.current) setPending(false); }
  }

  return <section aria-label={copy.title} className="min-w-0 space-y-3 border-t border-white/10 pt-3">
    <h3 className="font-bold text-zinc-200">{copy.title}</h3>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={assistanceButtonClass} aria-expanded={showPrivate} aria-controls={`${fieldId}-private`} onClick={() => setShowPrivate((value) => !value)}>{copy.messageAdmins}</button>
      <button type="button" className={assistanceButtonClass} aria-expanded={showDiscord} aria-controls={`${fieldId}-discord`} onClick={() => setShowDiscord((value) => !value)}>{copy.discord}</button>
    </div>
    <p className="text-xs text-zinc-400">{copy.availability}</p>
    <div id={`${fieldId}-private`} hidden={!showPrivate} className="space-y-3">{context?.request && !recoveringOpen ? <>
      {draft && <p role="status" className="text-sm text-amber-200">{copy.existingConversation}</p>}
      <AssistanceConversation requestId={context.request.id} tournamentId={context.room.tournamentId} initialReplyDraft={draft} onReplyDraftChange={setDraft} onRequestChange={updateRequest} />
    </> : <>
      <p className="text-sm text-zinc-400">{copy.privateNotice}</p>
      {context?.canCreate || recoveringOpen ? <form onSubmit={(event) => { event.preventDefault(); if (recoveringOpen) void refresh(); else void open(); }} className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-semibold text-zinc-200">{copy.initialLabel}</label>
        <textarea id={fieldId} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={copy.initialPlaceholder} rows={3} maxLength={ASSISTANCE_MESSAGE_MAX_LENGTH * 2} aria-describedby={`${fieldId}-help ${fieldId}-count`} className="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" />
        <p id={`${fieldId}-help`} className="text-xs text-zinc-400">{copy.initialRequired}</p>
        <p id={`${fieldId}-count`} className="text-xs text-zinc-500">{formatNumber(Array.from(draft).length, locale)} / {formatNumber(ASSISTANCE_MESSAGE_MAX_LENGTH, locale)} {copy.characters}</p>
        <button type="submit" disabled={pending || loading || (!recoveringOpen && !isAssistanceBody(draft))} className={assistanceButtonClass}>{pending || loading ? copy.sending : recoveringOpen ? copy.retry : copy.sendRequest}</button>
      </form> : <p role="status" className="text-sm text-zinc-400">{loading ? copy.loading : context ? copy.creationDisabled : copy.unavailable}</p>}
    </>}</div>
    <div id={`${fieldId}-discord`} hidden={!showDiscord} className="space-y-2 rounded-xl border border-white/10 p-3">
      <p className="text-sm text-zinc-400">{copy.discordNotice}</p>
      <p className="text-xs text-zinc-400">{copy.availability}</p>
      {context?.discordUrl ? <a href={context.discordUrl} target="_blank" rel="noreferrer" className={assistanceButtonClass}>{copy.discordOpen}</a> : <p className="text-sm text-amber-200">{copy.discordUnavailable}</p>}
      {context && <>
        <label className="block text-xs text-zinc-400" htmlFor={`${fieldId}-reference`}>{copy.reference}</label>
        <textarea id={`${fieldId}-reference`} readOnly rows={4} value={context.room.reference} className="w-full rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-zinc-300" />
        <button type="button" className={assistanceButtonClass} onClick={async () => {
          try { await navigator.clipboard.writeText(context.room.reference); if (alive.current) setCopied("yes"); }
          catch { if (alive.current) setCopied("failed"); }
        }}>{copy.copyReference}</button>
        {copied && <p role="status" className="text-xs text-zinc-400">{copied === "yes" ? copy.copied : copy.copyFailed}</p>}
      </>}
    </div>
    {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-orange-200">{error}</p><button type="button" disabled={loading || pending} className={assistanceButtonClass} onClick={() => void refresh()}>{copy.retry}</button></div>}
  </section>;
}
