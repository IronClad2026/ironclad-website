"use client";

import { useActionState } from "react";
import { updateMatchRoomEnabled } from "@/app/admin/system/match-room-actions";
import type { Locale } from "@/lib/i18n/config";
import { getMatchRoomControlCopy } from "@/lib/i18n/match-room-control";
import type { MatchRoomSettingResult } from "@/lib/match-room-settings";

type ControlState = { result: MatchRoomSettingResult | null; confirmed: MatchRoomSettingResult };

async function saveSetting(previous: ControlState, formData: FormData): Promise<ControlState> {
  try {
    const result = await updateMatchRoomEnabled(previous.result, formData);
    return { result, confirmed: result.ok ? result : previous.confirmed };
  } catch {
    return { result: { ok: false, code: "unavailable" }, confirmed: previous.confirmed };
  }
}

export default function AdminMatchRoomControl({ setting, locale }: {
  setting: MatchRoomSettingResult;
  locale: Locale;
}) {
  const copy = getMatchRoomControlCopy(locale);
  const [state, formAction, pending] = useActionState(saveSetting, { result: null, confirmed: setting });
  const current = state.confirmed;
  // If the initial read failed, only offer the safe explicit disable command.
  const nextEnabled = current.ok && !current.enabled;

  return (
    <section aria-labelledby="match-room-control-heading" className="rounded-2xl border border-orange-500/25 bg-zinc-950 p-5 sm:p-6">
      <h2 id="match-room-control-heading" className="text-2xl font-black text-white">{copy.title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{copy.description}</p>
      <p className="mt-3 font-bold text-zinc-200">{current.ok ? (current.enabled ? copy.enabled : copy.disabled) : copy.unavailable}</p>
      <form action={formAction} className="mt-4">
        <button type="submit" name="enabled" value={String(nextEnabled)} disabled={pending}
          className="min-h-11 rounded-xl border border-orange-400/60 px-4 py-3 font-bold text-orange-300 hover:bg-orange-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:opacity-50">
          {pending ? copy.saving : nextEnabled ? copy.enable : copy.disable}
        </button>
      </form>
      {state.result && <p role={state.result.ok ? "status" : "alert"} className="mt-3 text-sm text-zinc-300">{state.result.ok ? copy.saved : copy.failed}</p>}
    </section>
  );
}
