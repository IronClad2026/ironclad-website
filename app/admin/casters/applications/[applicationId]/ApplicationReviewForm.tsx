"use client";

import { useActionState } from "react";
import { reviewCasterApplication } from "../../application-actions";
import {
  CASTER_REVIEW_FEEDBACK_LIMIT,
  casterReviewDecisions,
  type CasterAdminResult,
  type CasterReviewDecision,
} from "../../admin-application-contracts";
import { casterAdminInput, casterAdminPanel, casterAdminPrimary } from "../../admin-application-styles";

const initialState: CasterAdminResult = { kind: "idle" };
const submittedDecisions: CasterReviewDecision[] = ["approve", "request_changes", "reject"];
const reopenedDecisions: CasterReviewDecision[] = ["reopen"];

export default function ApplicationReviewForm({ applicationId, revisionId, revisionVersion, status, canApprove }: {
  applicationId: string;
  revisionId: string;
  revisionVersion: number;
  status: "submitted" | "rejected";
  canApprove: boolean;
}) {
  const [state, action, pending] = useActionState(reviewCasterApplication, initialState);
  const decisions = status === "submitted" ? submittedDecisions : reopenedDecisions;

  return (
    <section className={casterAdminPanel} aria-labelledby="application-decision">
      <h2 id="application-decision" className="text-xl font-bold">Decision for revision {revisionVersion}</h2>
      {status === "submitted" && !canApprove && (
        <p className="mt-2 text-sm text-zinc-400">Approval requires an available account with a verified primary email.</p>
      )}
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="application" value={applicationId} />
        <input type="hidden" name="revision" value={revisionId} />
        <label className="grid gap-2 text-sm font-bold sm:max-w-md">
          Decision
          <select name="decision" defaultValue={status === "rejected" ? "reopen" : ""} required className={casterAdminInput}>
            <option value="" disabled>Choose a decision</option>
            {decisions.map((decision) => (
              <option key={decision} value={decision} disabled={decision === "approve" && !canApprove}>
                {casterReviewDecisions[decision]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Reason or feedback
          <textarea name="feedback" className={casterAdminInput} rows={4} maxLength={CASTER_REVIEW_FEEDBACK_LIMIT} required />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
          <input type="checkbox" name="confirm" value="yes" className="size-5 shrink-0 accent-orange-500" required />
          I reviewed revision {revisionVersion} and confirm this decision.
        </label>
        <button type="submit" className={casterAdminPrimary} disabled={pending}>
          {pending ? "Recording decision…" : "Record decision"}
        </button>
        {state.message && <p role={state.kind === "error" ? "alert" : "status"} className="text-sm text-orange-200">{state.message}</p>}
      </form>
    </section>
  );
}
