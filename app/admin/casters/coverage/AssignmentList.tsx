"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { casterAdminDate } from "../admin-application-contracts";
import { casterAdminInput, casterAdminPanel, casterAdminPrimary, casterAdminSecondary } from "../admin-application-styles";
import { loadCastingHistory, saveCastingAssignment } from "./actions";
import AssignmentFields, { assignmentUtcInput } from "./AssignmentFields";
import {
  coverageActionLabels,
  coverageScopeLabels,
  coverageStatusLabels,
  coverageWorkspaceHref,
  type AdminCoverageAssignment,
  type CoverageAuditEvent,
  type CoverageChoices,
  type CoverageMutationResult,
} from "./contracts";

export default function AssignmentList({ assignments, choices, scoped }: {
  assignments: AdminCoverageAssignment[];
  choices: CoverageChoices | null;
  scoped: boolean;
}) {
  const Heading = scoped ? "h3" : "h2";
  return (
    <section className={`${casterAdminPanel} space-y-4`} aria-labelledby="casting-assignments-title">
      <header className="space-y-1">
        <Heading id="casting-assignments-title" className="text-lg font-black">{scoped ? "Tournament coverage archive" : "Archived casting records"}</Heading>
        <p className="text-sm text-zinc-400">Historical assignments are read-only. Verified coverage can be corrected with an audit reason. Recorded times are in Sydney time.</p>
      </header>
      {assignments.length ? (
        <ul className="space-y-3">
          {assignments.map((assignment) => (
            <li id={`assignment-${assignment.id}`} key={assignment.id} className="scroll-mt-28 space-y-4 rounded-xl border border-white/10 bg-black p-4">
              <AssignmentItem assignment={assignment} choices={choices} scoped={scoped} />
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-zinc-300">No archived casting records have been recorded here.</p>}
    </section>
  );
}

function AssignmentItem({ assignment, choices, scoped }: {
  assignment: AdminCoverageAssignment;
  choices: CoverageChoices | null;
  scoped: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const canCorrect = assignment.status === "completed" && Boolean(assignment.verified_at);
  return (
    <>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-all font-bold">{assignment.caster_display_name || "Official caster"}</h4>
          <p className="break-words text-sm text-zinc-300">{[assignment.tournament_title, assignment.division_name, assignment.match_label].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-md border border-white/15 px-2 py-1 text-zinc-300">{coverageScopeLabels[assignment.scope]}</span>
          <span className={`rounded-md border px-2 py-1 ${assignment.status === "completed" ? "border-orange-400/35 bg-orange-500/10 text-orange-100" : "border-white/15 text-zinc-200"}`}>
            {coverageStatusLabels[assignment.status]}
          </span>
        </div>
      </header>
      <dl className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
        {assignment.scheduled_at && <div><dt className="text-zinc-400">Scheduled</dt><dd>{casterAdminDate(assignment.scheduled_at)}</dd></div>}
        {assignment.covered_at && <div><dt className="text-zinc-400">Covered</dt><dd>{casterAdminDate(assignment.covered_at)}</dd></div>}
        {assignment.verified_at && <div>
          <dt className="text-zinc-400">Verified</dt>
          <dd>{casterAdminDate(assignment.verified_at)}{assignment.verified_by && <span className="block break-all text-xs">{assignment.verified_by}</span>}</dd>
        </div>}
      </dl>
      {!assignment.target_available && <p className="text-sm text-orange-200">The original competition target is unavailable. This record keeps its original attribution.</p>}
      {assignment.own_match_reason && <p className="whitespace-pre-wrap break-words text-sm text-zinc-300"><strong>Recorded own-match exception</strong> {assignment.own_match_reason}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-orange-200">
        {assignment.broadcast_url && <a className="inline-flex min-h-11 items-center underline" href={assignment.broadcast_url} rel="noreferrer">Broadcast</a>}
        {assignment.recording_url && <a className="inline-flex min-h-11 items-center underline" href={assignment.recording_url} rel="noreferrer">Recording</a>}
        {assignment.media_url && <a className="inline-flex min-h-11 items-center underline" href={assignment.media_url} rel="noreferrer">{assignment.media_title || "Tournament Media"}</a>}
        {!scoped && assignment.tournament_available !== false && (
          <Link className="inline-flex min-h-11 items-center underline" prefetch={false} href={coverageWorkspaceHref(assignment.tournament_id)}>Open tournament coverage archive</Link>
        )}
      </div>
      <details className="border-t border-white/10 pt-2" onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-2 font-bold text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">
          {canCorrect ? "Correct verified coverage or inspect the audit" : "View audit history"}
        </summary>
        {expanded && <div className="space-y-4">
          {canCorrect && <AssignmentMutation key={`mutation-${assignment.version}`} assignment={assignment} choices={choices} />}
          <AssignmentHistory key={`history-${assignment.version}`} assignment={assignment.id} />
        </div>}
      </details>
    </>
  );
}

function AssignmentMutation({ assignment, choices }: {
  assignment: AdminCoverageAssignment;
  choices: CoverageChoices | null;
}) {
  const [values, setValues] = useState({
    scheduled: assignmentUtcInput(assignment.scheduled_at),
    covered: assignmentUtcInput(assignment.covered_at),
    broadcast: assignment.broadcast_url ?? "",
    recording: assignment.recording_url ?? "",
    media: assignment.media_id ?? "",
  });
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, submit, pending] = useActionState<CoverageMutationResult, FormData>(saveCastingAssignment, { kind: "idle" });
  return (
    <form action={submit} className="space-y-3 rounded-xl border border-white/10 p-4">
      <input type="hidden" name="assignment" value={assignment.id} />
      <input type="hidden" name="version" value={assignment.version} />
      <input type="hidden" name="action" value="correct" />
      <AssignmentFields value={values} onChange={setValues} choices={choices} match={assignment.match_id} mode="correct" />
      <label className="block space-y-1 text-sm font-bold">
        <span>Correction reason</span>
        <textarea name="reason" className={casterAdminInput} maxLength={2000} required value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input className="size-4 shrink-0 accent-orange-500" type="checkbox" name="confirm" value="yes" required
          checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />
        I confirm this correction to verified coverage.
      </label>
      {result.message && <p role={result.kind === "error" ? "alert" : "status"} className="text-sm text-orange-200">{result.message}</p>}
      <button className={casterAdminPrimary} disabled={pending || !confirm}>
        {pending ? "Saving…" : coverageActionLabels.correct}
      </button>
    </form>
  );
}

function AssignmentHistory({ assignment }: { assignment: string }) {
  const [trail, load, pending] = useActionState(loadCastingHistory, { kind: "idle" });
  return (
    <div className="space-y-2">
      <form action={load}>
        <input type="hidden" name="assignment" value={assignment} />
        <button className={casterAdminSecondary} disabled={pending}>
          {pending ? "Loading audit history…" : trail.kind === "ok" ? "Refresh audit history" : "Load audit history"}
        </button>
      </form>
      {trail.message && <p role="alert" className="text-sm text-orange-200">{trail.message}</p>}
      {trail.events?.length ? <ol className="space-y-2">{trail.events.map((event) => <AuditEntry key={event.id} event={event} />)}</ol> : null}
      {trail.kind === "ok" && !trail.events?.length && <p className="text-sm text-zinc-400">No audit entries were returned.</p>}
    </div>
  );
}

function AuditEntry({ event }: { event: CoverageAuditEvent }) {
  const changes = [
    ["status", "Status"], ["scheduled_at", "Scheduled time"], ["covered_at", "Coverage date"], ["verified_at", "Verification"],
    ["broadcast_url", "Broadcast URL"], ["recording_url", "Recording URL"], ["media_id", "Tournament Media"],
  ].flatMap(([field, label]) => {
    const previous = event.previous?.[field];
    const current = event.current?.[field];
    if (previous === current || (previous === undefined && current === null)) return [];
    return [{ field, label, previous: historyValue(field, previous), current: historyValue(field, current) }];
  });
  return (
    <li className="space-y-1 rounded-xl border border-white/10 p-3 text-sm">
      <p className="font-bold">{event.action === "create" ? "Schedule assignment" : coverageActionLabels[event.action]}</p>
      <p className="break-all text-xs text-zinc-400">{casterAdminDate(event.created_at)} · {event.actor}</p>
      {event.reason && <p className="whitespace-pre-wrap break-words text-zinc-200">{event.reason}</p>}
      {changes.length > 0 && <ul className="space-y-1 text-xs text-zinc-300">{changes.map(({ field, label, previous, current }) => (
        <li className="break-all" key={field}><strong>{label}</strong> {previous} → {current}</li>
      ))}</ul>}
    </li>
  );
}

function historyValue(field: string, value: unknown) {
  if (typeof value !== "string") return "—";
  if (field.endsWith("_at")) return casterAdminDate(value);
  if (field === "status" && Object.hasOwn(coverageStatusLabels, value)) return coverageStatusLabels[value as keyof typeof coverageStatusLabels];
  return value;
}
