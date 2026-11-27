"use client";

import { useActionState } from "react";
import { CASTER_REVIEW_FEEDBACK_LIMIT, type CasterAdminResult } from "../../admin-application-contracts";
import { casterAdminInput, casterAdminPanel, casterAdminPrimary } from "../../admin-application-styles";
import { moderateCaster } from "../../moderation-actions";
import { moderationLabels, type CasterModerationAction, type CasterModerationEntry } from "../../moderation-contracts";

const initialState: CasterAdminResult = { kind: "idle" };

export default function ModerationForm({ caster }: { caster: CasterModerationEntry }) {
  const [state, action, pending] = useActionState(moderateCaster, initialState);
  const actions: CasterModerationAction[] = [caster.hidden ? "restore" : "hide", caster.membership_status === "active" ? "suspend" : "reinstate"];

  return (
    <section className={casterAdminPanel} aria-labelledby="caster-moderation-decision">
      <h2 id="caster-moderation-decision" className="text-xl font-bold">Moderation decision</h2>
      <p className="mt-2 text-sm text-zinc-300">Visibility and caster membership are managed separately. Reinstatement retains the current visibility setting.</p>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="application" value={caster.application_id} />
        <input type="hidden" name="version" value={caster.moderation_version} />
        <label className="grid gap-2 text-sm font-bold sm:max-w-md">
          Action
          <select name="action" defaultValue="" required className={casterAdminInput}>
            <option value="" disabled>Choose an action</option>
            {actions.map((entry) => <option key={entry} value={entry}>{moderationLabels[entry]}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Moderation reason
          <textarea name="reason" className={casterAdminInput} rows={4} maxLength={CASTER_REVIEW_FEEDBACK_LIMIT} required />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
          <input type="checkbox" name="confirm" value="yes" className="size-5 shrink-0 accent-orange-500" required />
          I confirm this moderation decision for this caster.
        </label>
        <button type="submit" className={casterAdminPrimary} disabled={pending}>
          {pending ? "Recording decision…" : "Record moderation decision"}
        </button>
        {state.message ? <p role={state.kind === "error" ? "alert" : "status"} className="text-sm text-orange-200">{state.message}</p> : null}
      </form>
    </section>
  );
}
