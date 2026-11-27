import { isCasterApplicationId } from "../admin-application-contracts";
import { coverageActionLabels, MAX_CASTERS_PER_ASSIGNMENT, type CoverageMutation, type CoverageTarget } from "./contracts";

export function coverageFormText(form: FormData, name: string) {
  const values = form.getAll(name);
  if (!values.length) return "";
  return values.length === 1 && typeof values[0] === "string" ? values[0].trim() : null;
}

export function readCoverageId(form: FormData, name: string) {
  const value = coverageFormText(form, name);
  return isCasterApplicationId(value) ? value.toLowerCase() : null;
}

export function parseCoverageCasterIds(form: FormData) {
  const values = form.getAll("caster");
  if (!values.length || values.length > MAX_CASTERS_PER_ASSIGNMENT || !values.every(isCasterApplicationId)) return null;
  const ids = values.map((value) => value.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}

export function parseCoverageTarget(form: FormData): CoverageTarget | null {
  const tournament = readCoverageId(form, "tournament");
  const scope = coverageFormText(form, "scope");
  const division = optionalCoverageId(form, "division");
  const match = optionalCoverageId(form, "match");
  if (!tournament || division === false || match === false) return null;
  if (scope === "tournament" && !division && !match) return { tournament, division, match };
  if (scope === "division" && division && !match) return { tournament, division, match };
  if (scope === "match" && division && match) return { tournament, division, match };
  return null;
}

function optionalCoverageId(form: FormData, name: string): string | null | false {
  const value = coverageFormText(form, name);
  if (value === "") return null;
  return isCasterApplicationId(value) ? value.toLowerCase() : false;
}

function parseInstant(value: string | null): string | null | false {
  if (value === "") return null;
  if (value === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : false;
}

type Fields = {
  scheduled: string | null;
  covered: string | null;
  broadcast: string;
  recording: string;
  media: string | null;
  acknowledged: boolean;
  reason: string;
};

type Mutation = Fields & (
  | { action: "create"; target: CoverageTarget; casters: string[] }
  | { action: CoverageMutation; assignment: string; version: number }
);

export function parseCoverageAssignmentMutation(form: FormData): Mutation | null {
  const action = coverageFormText(form, "action");
  const scheduled = parseInstant(coverageFormText(form, "scheduled"));
  const covered = parseInstant(coverageFormText(form, "covered"));
  const broadcast = coverageFormText(form, "broadcast");
  const recording = coverageFormText(form, "recording");
  const reason = coverageFormText(form, "reason");
  const media = optionalCoverageId(form, "media");
  const ack = coverageFormText(form, "acknowledge");
  if (!action || scheduled === false || covered === false || media === false || broadcast === null || recording === null ||
      broadcast.length > 2048 || recording.length > 2048 || reason === null || reason.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason) || (ack !== "" && ack !== "yes") ||
      coverageFormText(form, "confirm") !== "yes") return null;
  const acknowledged = ack === "yes";
  if (acknowledged && !reason) return null;
  const fields = { scheduled, covered, broadcast, recording, reason, media, acknowledged };

  if (action === "create") {
    const target = parseCoverageTarget(form);
    const casters = parseCoverageCasterIds(form);
    return target && casters && !covered ? { ...fields, action, target, casters } : null;
  }
  if (!Object.hasOwn(coverageActionLabels, action)) return null;
  const assignment = readCoverageId(form, "assignment");
  const versionText = coverageFormText(form, "version");
  const version = versionText && /^\d{1,10}$/.test(versionText) ? Number(versionText) : -1;
  if (!assignment || version < 1 || version > 2_147_483_647) return null;
  const transitions = action as CoverageMutation;
  if ((action === "complete" || action === "correct") && !covered) return null;
  if ((action === "correct" || action === "cancel" || action === "unfulfilled") && !reason) return null;
  return { ...fields, action: transitions, assignment, version };
}
