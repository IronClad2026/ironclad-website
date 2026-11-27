"use server";

import { revalidatePath } from "next/cache";
import { casterCoverageTournamentHref, parseCasterCoverageBroadcastUrl, parseCasterCoverageRecordingUrl } from "@/lib/caster/coverage";
import { CASTER_STUDIO_PATH } from "@/lib/caster/contracts";
import { casterRpc } from "@/lib/caster/server";
import { casterAdminApplicationPage, type CasterAdminResult } from "../admin-application-contracts";
import {
  CASTER_COVERAGE_ADMIN_PATH,
  coverageSelectionKey,
  type CoverageAuditEvent,
  type CoverageConflictResult,
  type CoverageHistoryResult,
  type CoverageMutationResult,
  type CoverageSearchResult,
} from "./contracts";
import { currentCastingAdmin, isCoverageConflict, loadCastingCasters, parseAdminAssignment } from "./data";
import {
  coverageFormText,
  parseCoverageAssignmentMutation,
  parseCoverageCasterIds,
  parseCoverageTarget,
  readCoverageId,
} from "./inputs";

const denied: CasterAdminResult = { kind: "error", message: "Your current session cannot manage casting assignments." };
const unavailable: CasterAdminResult = { kind: "error", message: "Casting management is temporarily unavailable. Try again." };

export async function searchAssignmentCasters(_previous: CoverageSearchResult, form: FormData): Promise<CoverageSearchResult> {
  const actor = await currentCastingAdmin();
  if (!actor) return denied;
  const query = coverageFormText(form, "query");
  const page = casterAdminApplicationPage(coverageFormText(form, "page"));
  if (query === null || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    return { kind: "error", message: "Enter up to 100 search characters." };
  }
  return loadCastingCasters(actor, query, page);
}

export async function checkAssignmentConflicts(_previous: CoverageConflictResult, form: FormData): Promise<CoverageConflictResult> {
  const actor = await currentCastingAdmin();
  if (!actor) return denied;
  const target = parseCoverageTarget(form);
  const candidates = parseCoverageCasterIds(form);
  if (!target || !candidates) return { kind: "error", message: "Select a full assignment scope and at least one caster." };
  const conflicts = await Promise.all(candidates.map(async (caster) => {
    const result = await casterRpc<{ status: string; conflict?: unknown }>("caster_phase4_admin_conflict", {
      p_actor: actor,
      p_application_id: caster,
      p_tournament_id: target.tournament,
      p_division_id: target.division,
      p_match_id: target.match,
    });
    return result?.status === "ok" && isCoverageConflict(result.conflict) ? { caster, level: result.conflict } : null;
  }));
  if (conflicts.some((row) => !row)) return { kind: "error", message: "One or more casters or competition targets could not be checked. Refresh and review the selection." };
  return {
    kind: "ok",
    key: coverageSelectionKey(target, candidates),
    conflicts: conflicts.filter((row) => row !== null),
  };
}

export async function saveCastingAssignment(_previous: CoverageMutationResult, form: FormData): Promise<CoverageMutationResult> {
  const actor = await currentCastingAdmin();
  if (!actor) return denied;
  const parsed = parseCoverageAssignmentMutation(form);
  if (!parsed) return { kind: "error", message: "Check the assignment scope, dates, notes and confirmation." };

  const broadcast = parsed.broadcast ? parseCasterCoverageBroadcastUrl(parsed.broadcast) : null;
  const recording = parsed.recording ? parseCasterCoverageRecordingUrl(parsed.recording) : null;
  if ((parsed.broadcast && !broadcast) || (parsed.recording && !recording)) {
    return { kind: "error", message: "Use a supported Twitch or YouTube broadcast link and a supported recording URL." };
  }
  const fields = {
    p_actor: actor,
    p_scheduled_at: parsed.scheduled,
    p_broadcast_url: broadcast,
    p_recording_url: recording,
    p_media_id: parsed.media,
    p_acknowledged: parsed.acknowledged,
    p_reason: parsed.reason || null,
  };
  const add = parsed.action === "create" ? await casterRpc<{ status: string; assignments?: unknown[] }>("caster_phase4_admin_assign", {
    ...fields,
    p_application_ids: parsed.casters,
    p_tournament_id: parsed.target.tournament,
    p_division_id: parsed.target.division,
    p_match_id: parsed.target.match,
  }) : null;
  const change = parsed.action !== "create" ? await casterRpc<{ status: string; assignment?: unknown }>("caster_phase4_admin_save", {
    ...fields,
    p_assignment_id: parsed.assignment,
    p_expected_version: parsed.version,
    p_action: parsed.action,
    p_application_id: null,
    p_tournament_id: null,
    p_division_id: null,
    p_match_id: null,
    p_covered_at: parsed.covered,
  }) : null;

  switch ((add ?? change)?.status) {
    case "ok": {
      const saved = parseAdminAssignment(change?.assignment ?? add?.assignments?.[0]);
      revalidatePath(CASTER_COVERAGE_ADMIN_PATH);
      revalidatePath(CASTER_STUDIO_PATH);
      revalidatePath("/casters/[slug]", "page");
      if (saved) {
        revalidatePath(`/admin/tournaments/${saved.tournament_id}`);
        const tournament = casterCoverageTournamentHref(saved)?.split(/[?#]/, 1)[0];
        if (tournament) revalidatePath(tournament);
      }
      return { kind: "ok", message: parsed.action === "create"
        ? `${parsed.casters.length} casting ${parsed.casters.length === 1 ? "assignment" : "assignments"} scheduled.`
        : "Casting decision recorded." };
    }
    case "duplicate":
      return { kind: "error", message: "One or more selected casters already have an active or verified assignment for this exact scope. No duplicate was created." };
    case "own_match_ack_required":
      return { kind: "error", code: "own_match_ack_required", message: "A caster is a participant in this match. Choose another caster or record an explicit exception and reason." };
    case "conflict":
    case "locked":
      return { kind: "error", message: "The current assignment or caster availability changed. Reload and review the latest state." };
    case "target_unavailable":
      return { kind: "error", message: "The selected tournament, division, or match is no longer available for this action." };
    case "not_found":
    case "closed":
      return { kind: "error", message: "This assignment or caster account is unavailable." };
    case "invalid":
      return { kind: "error", message: "Review the assignment dates and make sure the selected links belong to its scope." };
    default:
      return unavailable;
  }
}

export async function loadCastingHistory(_previous: CoverageHistoryResult, form: FormData): Promise<CoverageHistoryResult> {
  const actor = await currentCastingAdmin();
  if (!actor) return denied;
  const assignment = readCoverageId(form, "assignment");
  if (!assignment) return unavailable;
  const result = await casterRpc<{ status: string; events?: CoverageAuditEvent[] }>("caster_phase4_admin_history", {
    p_actor: actor, p_assignment_id: assignment,
  });
  return result?.status === "ok" && Array.isArray(result.events) ? { kind: "ok", events: result.events } : unavailable;
}
