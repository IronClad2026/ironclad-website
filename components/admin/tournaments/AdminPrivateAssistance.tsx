"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getAdminPrivateAssistanceQueue } from "@/app/admin/tournaments/assistance-actions";
import AssistanceConversation, { assistanceButtonClass } from "@/components/AssistanceConversation";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import { getPrivateAssistanceCopy } from "@/lib/i18n/private-assistance";
import { formatNumber } from "@/lib/i18n/format";
import type { AssistanceAdminQueue, AssistanceFilter, AssistanceReplyInput, AssistanceRequest } from "@/lib/private-assistance";

type Props = { data: AssistanceAdminQueue; tournamentTitle: string };

export default function AdminPrivateAssistance(props: Props) {
  const { isLoaded, userId, sessionId, sessionClaims } = useAuth();
  const copy = getPrivateAssistanceCopy(useOptionalLocale());
  const role = (sessionClaims as { metadata?: { role?: unknown } } | undefined | null)?.metadata?.role;
  // This clears private client state promptly when identity changes. Every
  // underlying read and action independently authorizes the actual caller.
  if (!isLoaded) return <p role="status" className="text-sm text-zinc-400">{copy.loading}</p>;
  if (!userId || role !== "admin") return <p role="status" className="text-sm text-zinc-400">{copy.unavailable}</p>;
  return <AdminAssistanceSession key={`${userId}:${sessionId}:${props.data.tournamentId}`} {...props} />;
}

function AdminAssistanceSession({ data: initialData, tournamentTitle }: Props) {
  const locale = useOptionalLocale();
  const copy = getPrivateAssistanceCopy(locale);
  const [data, setData] = useState(initialData);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [missingSelection, setMissingSelection] = useState(false);
  const alive = useRef(false);
  const epoch = useRef({ value: 0 });
  const current = useRef(initialData);
  const reading = useRef(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [operations, setOperations] = useState<Record<string, AssistanceReplyInput | null>>({});
  const requested = useRef({ filter: initialData.filter, page: initialData.page, selectedId: initialData.selectedRequest?.id ?? null });

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!alive.current) return;
      current.current = initialData;
      requested.current = { filter: initialData.filter, page: initialData.page, selectedId: initialData.selectedRequest?.id ?? null };
      epoch.current.value++;
      reading.current = false;
      setPending(false);
      setData(initialData);
      setMissingSelection(false);
    });
  }, [initialData]);

  const load = useCallback(async function loadQueue(filter: AssistanceFilter, page: number, selectedId: string | null, explicit = false) {
    if (!alive.current || (!explicit && (reading.current || document.visibilityState === "hidden" || navigator.onLine === false))) return;
    const ticket = ++epoch.current.value;
    reading.current = true;
    requested.current = { filter, page, selectedId };
    setPending(true);
    if (explicit && selectedId !== current.current.selectedRequest?.id) setData((previous) => ({ ...previous, selectedRequest: null }));
    try {
      const result = await getAdminPrivateAssistanceQueue({ tournamentId: initialData.tournamentId, filter, page, selectedId });
      if (!alive.current || ticket !== epoch.current.value) return;
      if (!result.ok || result.data.tournamentId !== initialData.tournamentId) {
        if (!result.ok && (result.code === "auth_required" || result.code === "forbidden")) setData((previous) => ({ ...previous, requests: [], selectedRequest: null }));
        setFailed(true); return;
      }
      current.current = result.data;
      setData(result.data);
      requested.current = { filter: result.data.filter, page: result.data.page, selectedId: result.data.selectedRequest?.id ?? null };
      setMissingSelection(Boolean(selectedId && !result.data.selectedRequest));
      setFailed(false);
    } catch { if (alive.current && ticket === epoch.current.value) setFailed(true); }
    finally { if (ticket === epoch.current.value) { reading.current = false; if (alive.current) setPending(false); } }
  }, [initialData.tournamentId]);

  useEffect(() => {
    alive.current = true;
    const generation = epoch.current;
    const refresh = () => { const input = requested.current; void load(input.filter, input.page, input.selectedId); };
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false; generation.value++;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const onRequestChange = useCallback((request: AssistanceRequest) => {
    if (request.tournamentId !== initialData.tournamentId || !alive.current) return;
    const existing = current.current.selectedRequest;
    if (existing?.id !== request.id || existing.version === request.version) return;
    const input = requested.current;
    void load(input.filter, input.page, request.id);
  }, [initialData.tournamentId, load]);

  const selected = data.selectedRequest;
  const labels = { all: copy.all, open: copy.statusOpen, in_progress: copy.statusInProgress, resolved: copy.statusResolved };
  return <section aria-label={copy.adminTitle} className="min-w-0 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
    <h2 className="break-words text-2xl font-black text-white">{tournamentTitle} — {copy.adminTitle}</h2>
    <p className="text-sm text-zinc-400">{copy.scopeNotice}</p>
    <p className="text-sm text-amber-100">{copy.teamNotice}</p>
    {!data.newRequestsEnabled && <p className="text-sm text-zinc-400">{copy.creationDisabled}</p>}
    <a href={`/admin/notifications/legacy-assistance?kind=tournament&tournamentId=${encodeURIComponent(data.tournamentId)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-200 underline underline-offset-4">{copy.legacyRequests}</a>
    <p className="text-xs text-zinc-500">{copy.historyNotice}</p>
    <nav aria-label={copy.statusLabel} className="flex flex-wrap gap-2">{(["all", "open", "in_progress", "resolved"] as const).map((filter) => <button type="button" key={filter} aria-pressed={data.filter === filter} disabled={pending} className={assistanceButtonClass} onClick={() => void load(filter, 1, null, true)}>{labels[filter]} ({formatNumber(data.counts[filter], locale)})</button>)}</nav>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-zinc-400">{formatNumber(data.filteredCount, locale)} {copy.requests} · {copy.page} {formatNumber(data.page, locale)} / {formatNumber(data.pageCount, locale)}</p>
      <button type="button" disabled={pending} className={assistanceButtonClass} onClick={() => { const input = requested.current; void load(input.filter, input.page, input.selectedId, true); }}>{pending ? copy.refreshing : copy.refresh}</button>
    </div>
    {failed && <p role="alert" className="text-sm text-orange-200">{copy.unavailable}</p>}
    {missingSelection && <p role="alert" className="text-sm text-orange-200">{copy.unavailableSelection}</p>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
      <div className="min-w-0">
        {data.requests.length === 0 ? <p className="text-sm text-zinc-400">{copy.noRequests}</p> : <ul className="space-y-2">{data.requests.map((request) => <li key={request.id}>
          <button type="button" aria-pressed={selected?.id === request.id} disabled={pending} onClick={() => void load(data.filter, data.page, request.id, true)} className="w-full min-w-0 rounded-xl border border-white/10 p-3 text-left hover:border-orange-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50">
            <span className="block break-words font-semibold text-zinc-200">{request.requesterName || copy.requester}</span>
            <span className="mt-1 block break-words text-xs text-zinc-400">{request.divisionName} · {request.matchReference}</span>
            <span className="mt-1 block text-sm text-orange-200">{labels[request.status]}</span>
            <HydrationSafeLocalDateTime value={request.updatedAt} locale={locale} fallback="—" className="mt-1 block text-xs text-zinc-500" />
            <span className="sr-only">{copy.openConversation}</span>
          </button>
        </li>)}</ul>}
        <nav aria-label={copy.page} className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pending || data.page <= 1} className={assistanceButtonClass} onClick={() => void load(data.filter, data.page - 1, null, true)}>{copy.previous}</button>
          <button type="button" disabled={pending || data.page >= data.pageCount} className={assistanceButtonClass} onClick={() => void load(data.filter, data.page + 1, null, true)}>{copy.next}</button>
        </nav>
      </div>
      <div className="min-w-0">{selected ? <AssistanceConversation key={selected.id} requestId={selected.id} tournamentId={data.tournamentId} onRequestChange={onRequestChange} initialReplyDraft={drafts[selected.id] ?? ""} initialReplyOperation={operations[selected.id] ?? null} onReplyOperationChange={(operation) => setOperations((previous) => ({ ...previous, [selected.id]: operation }))} onReplyDraftChange={(draft) => setDrafts((previous) => ({ ...previous, [selected.id]: draft }))} /> : <p className="text-sm text-zinc-400">{copy.selectConversation}</p>}</div>
    </div>
  </section>;
}
