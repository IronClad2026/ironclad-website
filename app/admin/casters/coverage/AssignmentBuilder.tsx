"use client";

import { useActionState, useState } from "react";
import { casterAdminInput, casterAdminPanel, casterAdminPrimary, casterAdminSecondary } from "../admin-application-styles";
import { checkAssignmentConflicts, saveCastingAssignment, searchAssignmentCasters } from "./actions";
import AssignmentFields, { emptyAssignmentFields } from "./AssignmentFields";
import {
  coverageScopeLabels,
  coverageSelectionKey,
  conflictWarnings,
  MAX_CASTERS_PER_ASSIGNMENT,
  type CoverageCasterOption,
  type CoverageChoices,
  type CoverageMutationResult,
  type CoverageScope,
  type CoverageSearchResult,
} from "./contracts";

export default function AssignmentBuilder({ tournament, choices, initialCasters }: {
  tournament: string;
  choices: CoverageChoices;
  initialCasters: CoverageSearchResult;
}) {
  const [search, searchAction, searching] = useActionState(searchAssignmentCasters, initialCasters);
  const [check, checkAction, checking] = useActionState(checkAssignmentConflicts, { kind: "idle" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CoverageCasterOption[]>([]);
  const [scope, setScope] = useState<CoverageScope>("tournament");
  const [division, setDivision] = useState("");
  const [match, setMatch] = useState("");
  const [fields, setFields] = useState(emptyAssignmentFields);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [saved, saveAction, saving] = useActionState(async (previous: CoverageMutationResult, data: FormData) => {
    const result = await saveCastingAssignment(previous, data);
    if (result.kind === "ok") {
      setSelected([]);
      setFields(emptyAssignmentFields);
      setAcknowledged(false);
      setReason("");
    }
    return result;
  }, { kind: "idle" });

  const candidates = selected.map(({ id }) => id);
  const target = { tournament, division: division || null, match: match || null };
  const conflicts = check.key === coverageSelectionKey(target, candidates) ? check.conflicts : undefined;
  const ownMatch = conflicts?.some(({ level }) => level === "own_match") === true;
  const needsDivision = scope !== "tournament";
  const needsMatch = scope === "match";
  const availableMatches = choices.matches.filter((option) => option.division === division);
  const ready = candidates.length > 0 && (!needsDivision || Boolean(division)) && (!needsMatch || Boolean(match));
  const busy = saving || checking;

  function resetException() {
    setAcknowledged(false);
    setReason("");
  }

  function selectCaster(caster: CoverageCasterOption, checked: boolean) {
    setSelected((current) => checked ? [...current, caster] : current.filter(({ id }) => id !== caster.id));
    resetException();
  }

  return (
    <section className={`${casterAdminPanel} space-y-5`} aria-labelledby="create-casting-title">
      <header className="space-y-1">
        <h3 id="create-casting-title" className="text-lg font-black">Schedule casting</h3>
        <p className="text-sm text-zinc-400">Select up to {MAX_CASTERS_PER_ASSIGNMENT} approved casters for a tournament, division or match. A parent assignment covers only the selected scope.</p>
      </header>
      <form action={searchAction} className="space-y-3">
        <label className="block text-sm font-bold" htmlFor="coverage-caster-query">Find approved casters</label>
        <div className="flex flex-wrap gap-2">
          <input id="coverage-caster-query" name="query" className={`${casterAdminInput} flex-1 basis-48`}
            placeholder="Name or caster profile" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className={casterAdminSecondary} disabled={searching} name="page" value="1">{searching ? "Searching…" : "Search"}</button>
        </div>
        {search.message && <p role="alert" className="text-sm text-orange-200">{search.message}</p>}
        {search.kind === "ok" && !search.casters?.length && <p className="text-sm text-zinc-400">No eligible casters on this results page.</p>}
        {!!search.casters?.length && (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">Approved caster results</legend>
            {search.casters.map((caster) => {
              const checked = candidates.includes(caster.id);
              return (
                <label key={caster.id} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black p-2 text-sm">
                  <input type="checkbox" className="size-4 shrink-0 accent-orange-500" checked={checked}
                    disabled={busy || (!checked && selected.length >= MAX_CASTERS_PER_ASSIGNMENT)}
                    onChange={(event) => selectCaster(caster, event.target.checked)} />
                  <span className="min-w-0 break-all">{caster.label}{caster.slug ? <small className="block text-zinc-400">{caster.slug}</small> : null}</span>
                </label>
              );
            })}
          </fieldset>
        )}
      </form>
      {search.page && (search.page > 1 || search.hasMore) ? (
        <form action={searchAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="query" value={search.query ?? ""} />
          <button className={casterAdminSecondary} disabled={search.page <= 1 || searching} name="page" value={search.page - 1}>Previous results</button>
          <button className={casterAdminSecondary} disabled={!search.hasMore || searching} name="page" value={search.page + 1}>Next results</button>
        </form>
      ) : null}
      <form action={saveAction} className="space-y-4 border-t border-white/10 pt-4">
        <input type="hidden" name="action" value="create" />
        <input type="hidden" name="tournament" value={tournament} />
        <div className="space-y-2">
          <p className="text-sm font-bold" role="status">{selected.length} {selected.length === 1 ? "caster selected" : "casters selected"}</p>
          {!!selected.length && (
            <ul className="flex flex-wrap gap-2">
              {selected.map((caster) => (
                <li key={caster.id}>
                  <input type="hidden" name="caster" value={caster.id} />
                  <button className={casterAdminSecondary} type="button" disabled={busy} onClick={() => selectCaster(caster, false)} aria-label={`Remove ${caster.label}`}>
                    <span className="break-all">{caster.label}</span><span className="ml-2" aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-bold">
            <span>Assignment scope</span>
            <select name="scope" className={casterAdminInput} value={scope} onChange={(event) => {
              setScope(event.target.value as CoverageScope);
              setDivision("");
              setMatch("");
              setFields({ ...fields, media: "" });
              resetException();
            }}>
              {Object.entries(coverageScopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {needsDivision && <label className="space-y-1 text-sm font-bold">
            <span>Division</span>
            <select name="division" className={casterAdminInput} required value={division} onChange={(event) => {
              setDivision(event.target.value);
              setMatch("");
              setFields({ ...fields, media: "" });
              resetException();
            }}>
              <option value="">Choose a division</option>
              {choices.divisions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>}
          {needsMatch && <label className="space-y-1 text-sm font-bold">
            <span>Match</span>
            <select name="match" className={casterAdminInput} required value={match} disabled={!division}
              onChange={(event) => { setMatch(event.target.value); setFields({ ...fields, media: "" }); resetException(); }}>
              <option value="">{division && !availableMatches.length ? "No current matches in this division" : "Choose a match"}</option>
              {availableMatches.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {choices.matchLimitReached && <span className="block text-xs font-normal text-orange-200">This tournament exceeds the match picker limit.</span>}
          </label>}
        </div>
        <AssignmentFields value={fields} onChange={setFields} choices={choices} match={match || null} mode="scheduled" />
        <button type="submit" formAction={checkAction} formNoValidate disabled={!ready || busy} className={casterAdminSecondary}>
          {checking ? "Checking participation…" : "Check competition conflicts"}
        </button>
        {check.kind === "error" && <p role="alert" className="text-sm text-orange-200">{check.message}</p>}
        {conflicts && (
          <ul role="status" aria-label="Competition conflict results" className="space-y-2 text-sm">
            {conflicts.map(({ caster, level }) => (
              <li key={caster} className={level === "none" ? "text-zinc-300" : "text-orange-200"}>
                <strong>{selected.find(({ id }) => id === caster)?.label}</strong>
                {" — "}{level === "none" ? "No overlapping participation found." : conflictWarnings[level]}
              </li>
            ))}
          </ul>
        )}
        {ownMatch && (
          <div className="grid gap-3 rounded-xl border border-orange-400/35 p-3 text-sm">
            <label className="flex min-h-11 items-center gap-3">
              <input className="size-4 accent-orange-500" type="checkbox" name="acknowledge" value="yes" required
                checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I acknowledge the own-match conflict and approve an operational exception.
            </label>
            <label className="space-y-1">
              <span className="font-bold">Exception reason</span>
              <textarea name="reason" className={casterAdminInput} maxLength={2000} required value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
        )}
        {saved.message && <p role={saved.kind === "error" ? "alert" : "status"} className={`text-sm ${saved.kind === "error" ? "text-orange-200" : "text-white"}`}>{saved.message}</p>}
        <input type="hidden" name="confirm" value="yes" />
        <button className={casterAdminPrimary} disabled={!ready || !conflicts || busy || (ownMatch && (!acknowledged || !reason.trim()))}>
          {saving ? "Scheduling…" : "Schedule selected casters"}
        </button>
      </form>
    </section>
  );
}
