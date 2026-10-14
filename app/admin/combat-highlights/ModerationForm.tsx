"use client";
import { useActionState } from "react";
import type { HighlightModerationRow } from "@/lib/combat-highlights/moderation";
import { moderateHighlight } from "./actions";
export default function ModerationForm({ row }: { row: HighlightModerationRow }) {
  const [state, action, pending] = useActionState(moderateHighlight, { ok: false, code: "" });
  return <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
    <input type="hidden" name="playerId" value={row.playerId} /><input type="hidden" name="slotNumber" value={row.slotNumber} /><input type="hidden" name="revision" value={row.revision} /><input type="hidden" name="hidden" value={String(!row.hidden)} />
    <button disabled={pending} className="min-h-11 rounded border border-zinc-700 px-4 text-sm text-orange-200 disabled:opacity-50">{pending ? "Saving…" : row.hidden ? "Restore public eligibility" : "Hide clip"}</button>
    {state.code && <p role="status" className="text-sm text-zinc-300">{state.ok ? "Moderation saved." : state.code === "conflict" ? "This clip changed. Refresh before trying again." : "Could not update moderation. Try again."}</p>}
  </form>;
}
