"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { getMatchRoomAssistance, requestMatchAdminAssistance, resolveMatchAdminAssistance } from "@/app/tournaments/support-actions";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import { getMatchRoomCopy } from "@/lib/i18n/match-room";
import type { MatchRoomAssistance } from "@/lib/match-room-assistance";

export default function MatchRoomAssistanceControls(props: { roomId: string; admin?: boolean }) {
  return <AssistanceSession key={props.roomId} {...props} />;
}

function AssistanceSession({ roomId, admin = false }: { roomId: string; admin?: boolean }) {
  const copy = getMatchRoomCopy(useOptionalLocale());
  const [state, setState] = useState<MatchRoomAssistance | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [pending, setPending] = useState<"request" | "resolve" | null>(null);
  const scope = useRef({ mounted: false, generation: 0 });
  const mutating = useRef(false);
  const loading = useRef(false);

  const refresh = useCallback(async function refreshAssistance() {
    if (!scope.current.mounted || mutating.current || loading.current || document.visibilityState === "hidden" || navigator.onLine === false) return;
    loading.current = true;
    const version = scope.current.generation;
    try {
      const result = await getMatchRoomAssistance({ roomId });
      if (!scope.current.mounted || version !== scope.current.generation) return;
      setFailed(!result.ok);
      if (result.ok) setState(result.data);
      else if (result.code === "forbidden" || result.code === "auth_required") setState(null);
    } catch {
      if (scope.current.mounted && version === scope.current.generation) setFailed(true);
    } finally {
      loading.current = false;
      if (scope.current.mounted && version !== scope.current.generation && !mutating.current) void refreshAssistance();
    }
  }, [roomId]);

  useEffect(() => {
    const lifecycle = scope.current;
    lifecycle.mounted = true;
    void Promise.resolve().then(refresh);
    const timer = window.setInterval(() => void refresh(), 10_000);
    const onReturn = () => void refresh();
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      lifecycle.mounted = false;
      lifecycle.generation++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);

  async function mutate(action: "request" | "resolve") {
    if (!state || failed || mutating.current) return;
    mutating.current = true;
    scope.current.generation++;
    setPending(action);
    setActionFailed(false);
    try {
      const result = await (action === "resolve" ? resolveMatchAdminAssistance : requestMatchAdminAssistance)({
        roomId, expectedRequestVersion: state.requestVersion,
      });
      if (!scope.current.mounted) return;
      if (result.ok) {
        setState(result.data);
        setFailed(false);
      } else {
        setActionFailed(true);
        if (result.code === "forbidden" || result.code === "auth_required") setState(null);
      }
    } catch { if (scope.current.mounted) setActionFailed(true); }
    finally {
      mutating.current = false;
      if (scope.current.mounted) { setPending(null); void refresh(); }
    }
  }

  const buttonClass = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-bold text-zinc-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-60";
  return (
    <section aria-label={copy.assistanceLabel} className="space-y-2 border-t border-white/10 pt-3">
      <p role="status" className="text-sm text-zinc-400">
        {!state ? (failed ? copy.assistanceLoadFailed : copy.loading) :
          state.status === "requested" ? copy.assistanceStatusRequested :
          state.status === "resolved" ? copy.assistanceStatusResolved : copy.assistanceStatusNone}
      </p>
      {state && (state.status !== "requested" ? (
        <button type="button" disabled={pending !== null || failed} onClick={() => void mutate("request")} className={buttonClass}>
          <LifeBuoy size={16} aria-hidden="true" />
          {pending === "request" ? copy.assistancePending : state.status === "resolved" ? (admin ? copy.assistanceReopen : copy.assistanceRequestAgain) : copy.assistanceLabel}
        </button>
      ) : state.canResolve ? (
        <button type="button" disabled={pending !== null || failed} onClick={() => void mutate("resolve")} className={buttonClass}>
          {pending === "resolve" ? copy.assistanceResolving : copy.assistanceResolve}
        </button>
      ) : null)}
      {actionFailed && <p role="alert" className="text-sm text-orange-200">{copy.assistanceActionFailed}</p>}
      {failed && <button type="button" onClick={() => void refresh()} className={buttonClass}>{copy.retry}</button>}
    </section>
  );
}
