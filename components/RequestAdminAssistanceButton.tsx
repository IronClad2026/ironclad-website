"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LifeBuoy } from "lucide-react";
import { getMatchRoomOpponentDiscord, requestMatchAdminAssistance } from "@/app/tournaments/support-actions";
import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import { getMatchRoomCopy } from "@/lib/i18n/match-room";

export default function RequestAdminAssistanceButton({
  matchId,
  roomId,
  roomRevision,
}: {
  matchId: string;
  roomId: string;
  roomRevision: number;
}) {
  const copy = getMatchRoomCopy(useOptionalLocale());
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <button
        type="button"
        disabled={pending || status === "success"}
        onClick={() => startTransition(async () => {
          try {
            const result = await requestMatchAdminAssistance({ matchId, roomId, roomRevision });
            setStatus(result.success ? "success" : "error");
          } catch {
            setStatus("error");
          }
        })}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-zinc-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-60"
      >
        <LifeBuoy size={16} aria-hidden="true" />
        {pending ? copy.assistancePending : copy.assistanceLabel}
      </button>
      {status !== "idle" && (
        <p role={status === "error" ? "alert" : "status"} className="text-sm text-zinc-400">
          {status === "success" ? copy.assistanceSuccess : copy.assistanceFailure}
        </p>
      )}
    </div>
  );
}
export function MatchRoomSupportFooter(props: {
  matchId: string;
  roomId: string;
  roomRevision: number;
}) {
  const copy = getMatchRoomCopy(useOptionalLocale());
  const [pending, startTransition] = useTransition();
  const [contactStatus, setContactStatus] = useState<"idle" | "copied" | "hidden" | "failed">("idle");
  const [contactShared, setContactShared] = useState<boolean | null>(null);
  const activeRoom = useRef<string | null>(props.roomId);
  useEffect(() => {
    let cancelled = false;
    activeRoom.current = props.roomId;
    void getMatchRoomOpponentDiscord({ roomId: props.roomId }).then(
      (contact) => { if (!cancelled) setContactShared(Boolean(contact.discordUsername)); },
      () => { if (!cancelled) setContactShared(false); }
    );
    return () => { cancelled = true; activeRoom.current = null; };
  }, [props.roomId]);
  return (
    <div className="space-y-3">
      <RequestAdminAssistanceButton {...props} />
      <div className="border-t border-white/10 pt-3">
        <p className="text-xs text-zinc-500">{copy.discordOptional}</p>
        {contactShared === true && <button
          type="button"
          disabled={pending}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-zinc-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-60"
          onClick={() => startTransition(async () => {
            try {
              const contact = await getMatchRoomOpponentDiscord({ roomId: props.roomId });
              if (activeRoom.current !== props.roomId) return;
              if (!contact.discordUsername) {
                setContactShared(false);
                setContactStatus("hidden");
                return;
              }
              await navigator.clipboard.writeText(contact.discordUsername);
              setContactStatus("copied");
            } catch {
              setContactStatus("failed");
            }
          })}
        >
          {copy.discordCopy}
        </button>}
        {contactShared === false && <p className="mt-2 text-xs text-zinc-400">{copy.discordNotShared}</p>}
        {contactStatus !== "idle" && contactStatus !== "hidden" && (
          <p role="status" className="text-xs text-zinc-400">
            {contactStatus === "copied" ? copy.discordCopied : copy.discordCopyFailed}
          </p>
        )}
      </div>
    </div>
  );
}
