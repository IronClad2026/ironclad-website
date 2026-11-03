"use client";

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef,
  useState, type ReactNode,
} from "react";
import { useAuth } from "@clerk/nextjs";
import {
  translateMatchChatMessage, validateMatchChatTranslations,
} from "@/lib/chat-translation-client";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import { isLocale, LOCALE_OPTIONS, type Locale } from "@/lib/i18n/config";
import { getChatTranslationCopy, type ChatTranslationCopy } from "@/lib/i18n/chat-translation";
import type { MatchRoomMessage } from "@/lib/match-room";

type Translation = Extract<Awaited<ReturnType<typeof translateMatchChatMessage>>, { ok: true }>["data"];
type MessageState = {
  sourceBody: string;
  pending: boolean;
  showOriginal: boolean;
  translation: Translation | null;
  failure?: "unavailable";
};
type Original = { original: string | null; sourceHash: string | null; observedBody?: string };
type Preferences = { readingLanguage: Locale; automatic: boolean };
type Context = {
  copy: ChatTranslationCopy;
  language: Locale;
  source: Locale | "auto";
  automatic: boolean;
  enabled: boolean;
  available: boolean;
  denied: boolean;
  states: ReadonlyMap<string, MessageState>;
  originals: ReadonlyMap<string, Original>;
  setLanguage: (language: Locale) => void;
  setSource: (source: Locale | "auto") => void;
  setAutomatic: (automatic: boolean) => void;
  translate: (message: MatchRoomMessage) => Promise<void>;
  showOriginal: (messageId: string) => void;
};
const TranslationContext = createContext<Context | null>(null);
const VALIDATE_MS = 15_000;
const MAX_TRACKED = 50;
const buttonClass = "min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-orange-400/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:opacity-50";
const selectClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200 focus:border-orange-400 focus:outline-none";

function visibleAndOnline() {
  return document.visibilityState !== "hidden" && navigator.onLine !== false;
}

type ProviderProps = {
  roomId: string;
  viewerRegistrationId: string | null;
  messages: readonly MatchRoomMessage[];
  children: ReactNode;
  active?: boolean;
};

/** A separate session keeps translation entirely outside chat sending and drafts. */
export function MatchChatTranslationProvider(props: ProviderProps) {
  const { userId, sessionId } = useAuth();
  if (props.active === false) return props.children;
  return <TranslationSession key={`${userId}:${sessionId}:${props.roomId}`} {...props} userId={userId ?? null} />;
}

function TranslationSession({ roomId, viewerRegistrationId, messages, children, userId }: ProviderProps & { userId: string | null }) {
  const locale = useOptionalLocale();
  const copy = getChatTranslationCopy(locale);
  const [preferences, setPreferences] = useState<Preferences>({ readingLanguage: locale, automatic: false });
  const [source, setSourceValue] = useState<Locale | "auto">("auto");
  const [states, setStates] = useState<Map<string, MessageState>>(new Map());
  const [originals, setOriginals] = useState<Map<string, Original>>(new Map());
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const [denied, setDenied] = useState(false);
  const lifecycle = useRef({ alive: false, epoch: 0 });
  const settings = useRef({ ...preferences, source, enabled, available });
  const tracked = useRef(new Set<string>());
  const originalsRef = useRef(originals);
  const pending = useRef(new Set<string>());
  const operations = useRef(new Map<string, object>());
  const validationPending = useRef(false);
  const messagesRef = useRef(messages);
  const autoCursor = useRef(Math.max(0, ...messages.map((message) => message.sequence)));
  const autoQueue = useRef<{ message: MatchRoomMessage; epoch: number }[]>([]);
  const autoRunning = useRef(false);
  const storageKey = userId ? `ironclad.chat-translation.v1:${userId}` : null;
  const hydrated = useRef(false);
  const explicitLanguage = useRef(false);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const clearDerived = useCallback(() => {
    lifecycle.current.epoch++;
    pending.current.clear();
    operations.current.clear();
    autoQueue.current = [];
    setStates(new Map());
  }, []);

  const persist = useCallback((value: Preferences) => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Preferences are optional. */ }
  }, [storageKey]);

  const setLanguage = useCallback((readingLanguage: Locale) => {
    explicitLanguage.current = true;
    clearDerived();
    const next = { readingLanguage, automatic: settings.current.automatic };
    settings.current = { ...settings.current, ...next };
    setPreferences(next);
    persist(next);
  }, [clearDerived, persist]);

  const setSource = useCallback((value: Locale | "auto") => {
    clearDerived();
    settings.current.source = value;
    setSourceValue(value);
  }, [clearDerived]);

  const setAutomatic = useCallback((automatic: boolean) => {
    autoQueue.current = [];
    autoCursor.current = Math.max(0, ...messagesRef.current.map((message) => message.sequence));
    const next = { readingLanguage: settings.current.readingLanguage, automatic };
    settings.current = { ...settings.current, ...next };
    setPreferences(next);
    persist(next);
  }, [persist]);

  const rememberOriginal = useCallback((messageId: string, value: Original) => {
    // Once deletion/redaction is known, an older response or stale chat prop may
    // never bring that source back into this mounted conversation.
    if (originalsRef.current.get(messageId)?.original === null) return;
    const next = new Map(originalsRef.current).set(messageId, {
      ...value, observedBody: messagesRef.current.find((message) => message.id === messageId)?.body,
    });
    originalsRef.current = next;
    setOriginals(next);
  }, []);

  const track = useCallback((messageId: string) => {
    tracked.current.delete(messageId);
    tracked.current.add(messageId);
    if (tracked.current.size > MAX_TRACKED) {
      const oldest = tracked.current.values().next().value as string;
      tracked.current.delete(oldest);
      operations.current.delete(oldest);
      pending.current.delete(oldest);
      setStates((current) => { const next = new Map(current); next.delete(oldest); return next; });
      if (originalsRef.current.get(oldest)?.original !== null) {
        const next = new Map(originalsRef.current);
        next.delete(oldest);
        originalsRef.current = next;
        setOriginals(next);
      }
    }
  }, []);

  const translate = useCallback(async (message: MatchRoomMessage, sourceOverride?: Locale | "auto") => {
    if (!lifecycle.current.alive || !visibleAndOnline() || !settings.current.enabled ||
        !settings.current.available || message.senderKind !== "player" || pending.current.has(message.id) ||
        originalsRef.current.get(message.id)?.original === null) return;
    const epoch = lifecycle.current.epoch;
    const operation = {};
    operations.current.set(message.id, operation);
    pending.current.add(message.id);
    track(message.id);
    const selected = { language: settings.current.readingLanguage, source: sourceOverride ?? settings.current.source };
    setStates((current) => new Map(current).set(message.id, {
      sourceBody: message.body, pending: true, showOriginal: true, translation: null,
    }));
    const current = () => lifecycle.current.alive && lifecycle.current.epoch === epoch &&
      operations.current.get(message.id) === operation && visibleAndOnline() &&
      messagesRef.current.some((entry) => entry.id === message.id && entry.body === message.body) &&
      originalsRef.current.get(message.id)?.original !== null;
    try {
      const result = await translateMatchChatMessage({
        roomId, messageId: message.id, targetLanguage: selected.language, sourceLanguage: selected.source,
      });
      if (!current()) return;
      if (!result.ok) {
        if (result.code === "auth_required" || result.code === "forbidden") {
          clearDerived();
          setDenied(true);
        } else setStates((previous) => new Map(previous).set(message.id, {
          sourceBody: message.body, pending: false, showOriginal: true, translation: null, failure: "unavailable",
        }));
        return;
      }
      if (result.data.roomId !== roomId || result.data.messageId !== message.id || result.data.targetLanguage !== selected.language) return;
      rememberOriginal(message.id, { original: result.data.original, sourceHash: result.data.sourceHash });
      setStates((previous) => new Map(previous).set(message.id, {
        sourceBody: message.body, pending: false, showOriginal: result.data.status !== "translated",
        translation: result.data,
      }));
    } catch {
      if (current()) setStates((previous) => new Map(previous).set(message.id, {
        sourceBody: message.body, pending: false, showOriginal: true, translation: null, failure: "unavailable",
      }));
    } finally {
      if (operations.current.get(message.id) === operation) {
        pending.current.delete(message.id);
        operations.current.delete(message.id);
      }
    }
  }, [clearDerived, rememberOriginal, roomId, track]);

  const validate = useCallback(async () => {
    if (!lifecycle.current.alive || !visibleAndOnline() || validationPending.current) return;
    validationPending.current = true;
    const epoch = lifecycle.current.epoch;
    const ids = [...tracked.current].filter((id) => messagesRef.current.some((message) => message.id === id));
    const versions = new Map(operations.current);
    const bodies = new Map(messagesRef.current.map((message) => [message.id, message.body]));
    const current = () => lifecycle.current.alive && lifecycle.current.epoch === epoch && visibleAndOnline();
    try {
      const result = await validateMatchChatTranslations({ roomId, messageIds: ids });
      if (!current()) return;
      if (!result.ok) {
        clearDerived();
        settings.current.available = false;
        setAvailable(false);
        if (result.code === "auth_required" || result.code === "forbidden") setDenied(true);
        return;
      }
      settings.current = { ...settings.current, enabled: result.data.enabled, available: true };
      setEnabled(result.data.enabled);
      setAvailable(true);
      if (!result.data.enabled) clearDerived();
      for (const id of ids) {
        const value = result.data.messages.find((message) => message.messageId === id) ?? { original: null, sourceHash: null };
        if (value.original !== null && (operations.current.get(id) !== versions.get(id) ||
            messagesRef.current.find((message) => message.id === id)?.body !== bodies.get(id))) continue;
        rememberOriginal(id, value);
        setStates((previous) => {
          const entry = previous.get(id);
          if (!entry || (value.original !== null && entry.translation?.sourceHash === value.sourceHash)) return previous;
          const next = new Map(previous);
          next.delete(id);
          return next;
        });
      }
    } catch {
      if (current()) {
        clearDerived();
        settings.current.available = false;
        setAvailable(false);
      }
    } finally { validationPending.current = false; }
  }, [clearDerived, rememberOriginal, roomId]);

  useEffect(() => {
    const currentLifecycle = lifecycle.current;
    currentLifecycle.alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => { void validate(); schedule(); }, VALIDATE_MS); };
    const resume = () => {
      if (!visibleAndOnline()) {
        clearDerived();
        settings.current.available = false;
        setAvailable(false);
      } else void validate();
    };
    void Promise.resolve().then(validate);
    schedule();
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      currentLifecycle.alive = false;
      currentLifecycle.epoch++;
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [clearDerived, validate]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      if (!hydrated.current) {
        hydrated.current = true;
        try {
          const stored: unknown = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "null") : null;
          if (stored && typeof stored === "object" && "readingLanguage" in stored && "automatic" in stored &&
              isLocale(stored.readingLanguage) && typeof stored.automatic === "boolean") {
            explicitLanguage.current = true;
            const next = { readingLanguage: stored.readingLanguage, automatic: stored.automatic };
            settings.current = { ...settings.current, ...next };
            setPreferences(next);
          }
        } catch { /* Corrupt or unavailable storage falls back to website language. */ }
      }
      if (!explicitLanguage.current && settings.current.readingLanguage !== locale) {
        clearDerived();
        settings.current.readingLanguage = locale;
        setPreferences((previous) => ({ ...previous, readingLanguage: locale }));
      }
    });
    return () => { alive = false; };
  }, [clearDerived, locale, storageKey]);

  useEffect(() => {
    const latest = Math.max(autoCursor.current, ...messages.map((message) => message.sequence));
    const incoming = messages.filter((message) => message.sequence > autoCursor.current && message.senderKind === "player" &&
      message.senderRegistrationId !== viewerRegistrationId);
    autoCursor.current = latest;
    if (!preferences.automatic || !enabled || !available) return;
    autoQueue.current.push(...incoming.map((message) => ({ message, epoch: lifecycle.current.epoch })));
    if (autoRunning.current) return;
    // Serial requests avoid a burst; subsequent history polls do not cancel a
    // queued incoming message. Scope/language/visibility changes still do.
    autoRunning.current = true;
    void (async () => {
      try {
        while (autoQueue.current.length && lifecycle.current.alive && settings.current.automatic) {
          const next = autoQueue.current.shift()!;
          if (next.epoch === lifecycle.current.epoch) await translate(next.message, "auto");
        }
      } finally { autoRunning.current = false; }
    })();
  }, [available, enabled, messages, preferences.automatic, translate, viewerRegistrationId]);

  const showOriginal = useCallback((messageId: string) => {
    setStates((previous) => {
      const entry = previous.get(messageId);
      return entry ? new Map(previous).set(messageId, { ...entry, showOriginal: true }) : previous;
    });
  }, []);

  const value = useMemo<Context>(() => ({
    copy, language: preferences.readingLanguage, source, automatic: preferences.automatic,
    enabled, available, denied, states, originals, setLanguage, setSource, setAutomatic, translate, showOriginal,
  }), [copy, preferences, source, enabled, available, denied, states, originals, setLanguage, setSource, setAutomatic, translate, showOriginal]);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function MatchChatTranslationControls() {
  const context = useContext(TranslationContext);
  const infoId = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  const infoContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!infoOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !infoContainer.current?.contains(event.target)) setInfoOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture before the surrounding workspace's Escape handler, including
      // hover-open notices when keyboard focus is still in a chat/result draft.
      event.preventDefault(); event.stopPropagation(); setInfoOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape, true);
    };
  }, [infoOpen]);
  if (!context) return null;
  const { copy } = context;
  return <section aria-label={copy.title} className="relative mt-4 min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
    <div className="flex items-center gap-2">
      <h4 className="text-xs font-semibold text-zinc-300">{copy.title}</h4>
      <div ref={infoContainer} onMouseEnter={() => setInfoOpen(true)}
        onMouseLeave={() => { if (!infoContainer.current?.contains(document.activeElement)) setInfoOpen(false); }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInfoOpen(false); }}>
        <button type="button" aria-label={copy.info} aria-expanded={infoOpen} aria-controls={infoId}
          aria-describedby={infoOpen ? infoId : undefined} onFocus={() => setInfoOpen(true)}
          onClick={() => setInfoOpen(true)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm text-zinc-400 hover:text-orange-300 focus-visible:outline-2 focus-visible:outline-orange-400">ⓘ</button>
        <div id={infoId} role="note" hidden={!infoOpen}
          className="absolute left-3 right-3 top-14 z-20 max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-200 shadow-xl">{copy.notice}</div>
      </div>
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-xs text-zinc-400">{copy.readingLanguage}
        <select value={context.language} onChange={(event) => { if (isLocale(event.target.value)) context.setLanguage(event.target.value); }} className={selectClass}>
          {LOCALE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-xs text-zinc-400">{copy.sourceLanguage}
        <select value={context.source} onChange={(event) => { if (event.target.value === "auto" || isLocale(event.target.value)) context.setSource(event.target.value); }} className={selectClass}>
          <option value="auto">{copy.automaticSource}</option>
          {LOCALE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-xs leading-relaxed text-zinc-300">
      <input type="checkbox" checked={context.automatic} disabled={!context.enabled || !context.available || context.denied}
        onChange={(event) => context.setAutomatic(event.target.checked)} className="h-5 w-5 shrink-0 accent-orange-500" />{copy.automatic}
    </label>
    <p className="text-xs leading-relaxed text-zinc-500">{copy.automaticNotice}</p>
    {(context.language === "zh-CN" || context.language === "pt-BR") && <p className="mt-2 text-xs leading-relaxed text-zinc-500">{copy.variantNotice}</p>}
    {(!context.enabled || !context.available) && <p role="status" className="mt-2 text-xs leading-relaxed text-zinc-400">{copy.unavailable}</p>}
  </section>;
}

export function MatchChatTranslatedMessage({ message }: { message: MatchRoomMessage }) {
  const context = useContext(TranslationContext);
  if (!context || message.senderKind !== "player") return <OriginalMessage body={message.body} />;
  const { copy } = context;
  if (context.denied) return <p className="mt-1 text-sm text-zinc-400">{copy.denied}</p>;
  const original = context.originals.get(message.id);
  if (original?.original === null) return <p className="mt-1 text-sm text-zinc-500">{copy.redacted}</p>;
  const entry = context.states.get(message.id);
  const current = entry?.sourceBody === message.body ? entry : undefined;
  const translated = current?.translation?.status === "translated" && !current.showOriginal ? current.translation.translatedText : null;
  const status = current?.translation?.status;
  const statusText = current?.failure ? copy.unavailable : status && status !== "translated" && status !== "disabled"
    ? copy[status] : status === "disabled" ? copy.unavailable : null;
  return <div className="min-w-0">
    {translated !== null && <p className="mt-2 text-[11px] font-semibold text-orange-300">{copy.translated}</p>}
    <OriginalMessage lang={translated !== null ? context.language : undefined}
      body={translated ?? (original?.observedBody === message.body ? original.original : null) ?? message.body} />
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {translated !== null ? <button type="button" className={buttonClass} onClick={() => context.showOriginal(message.id)}>{copy.showOriginal}</button> :
        <button type="button" className={buttonClass} disabled={current?.pending || !context.enabled || !context.available}
          onClick={() => void context.translate(message)}>{current?.pending ? copy.translating : copy.translate}</button>}
      {statusText && <p role="status" className="min-w-0 text-xs leading-relaxed text-zinc-400">{statusText}</p>}
    </div>
  </div>;
}

function OriginalMessage({ body, lang }: { body: string; lang?: string }) {
  return <p lang={lang} className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{body}</p>;
}
