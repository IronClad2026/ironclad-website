"use client";

import { casterAdminInput } from "../admin-application-styles";
import type { CoverageChoices } from "./contracts";

export type AssignmentFieldsValue = {
  scheduled: string; covered: string; broadcast: string; recording: string; media: string;
};

export const emptyAssignmentFields: AssignmentFieldsValue = {
  scheduled: "", covered: "", broadcast: "", recording: "", media: "",
};

export function assignmentUtcInput(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19) : "";
}

function toUtcInstant(value: string) {
  if (!value) return "";
  const date = new Date(`${value}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

export default function AssignmentFields({ value, onChange, choices, mode, match }: {
  value: AssignmentFieldsValue;
  onChange: (value: AssignmentFieldsValue) => void;
  choices: CoverageChoices | null;
  mode: "scheduled" | "complete" | "correct";
  match: string | null;
}) {
  const media = choices?.media.filter((item) => item.match === match) ?? [];
  const covered = mode === "complete" || mode === "correct";
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {mode === "scheduled" && <label className="space-y-1 text-sm font-bold">
        <span>Scheduled time (UTC)</span>
        <input type="datetime-local" step={1} className={casterAdminInput} value={value.scheduled}
          onChange={(event) => onChange({ ...value, scheduled: event.target.value })} />
      </label>}
      {covered && <label className="space-y-1 text-sm font-bold">
        <span>Coverage date and time (UTC)</span>
        <input type="datetime-local" step={1} required className={casterAdminInput} value={value.covered}
          onChange={(event) => onChange({ ...value, covered: event.target.value })} />
      </label>}
      {mode === "scheduled" && <input type="hidden" name="scheduled" value={toUtcInstant(value.scheduled)} />}
      {covered && <input type="hidden" name="covered" value={toUtcInstant(value.covered)} />}
      <label className="space-y-1 text-sm font-bold">
        <span>Broadcast URL (Twitch or YouTube)</span>
        <input type="url" name="broadcast" maxLength={2048} className={casterAdminInput} value={value.broadcast}
          onChange={(event) => onChange({ ...value, broadcast: event.target.value })} />
      </label>
      <label className="space-y-1 text-sm font-bold">
        <span>Recording URL (Twitch or YouTube)</span>
        <input type="url" name="recording" maxLength={2048} className={casterAdminInput} value={value.recording}
          onChange={(event) => onChange({ ...value, recording: event.target.value })} />
      </label>
      <label className="space-y-1 text-sm font-bold">
        <span>Published Tournament Media</span>
        <select name="media" className={casterAdminInput}
          value={media.some((item) => item.id === value.media) ? value.media : ""}
          onChange={(event) => onChange({ ...value, media: event.target.value })}>
          <option value="">No linked Tournament Media</option>
          {media.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {value.media && !media.some((item) => item.id === value.media) && (
          <span className="block text-xs font-normal text-orange-200">The previously selected media is unavailable. Select another published item if applicable.</span>
        )}
        {choices?.mediaLimitReached && (
          <span className="block text-xs font-normal text-zinc-400">Showing the 500 newest published media entries. You can also paste an approved video URL.</span>
        )}
      </label>
    </div>
  );
}
