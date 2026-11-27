"use server";

import { revalidatePath } from "next/cache";
import { parseCasterCoverageBroadcastUrl, parseCasterCoverageRecordingUrl } from "@/lib/caster/coverage";
import { casterRpc } from "@/lib/caster/server";
import { currentCastingAdmin } from "./data";
import { parseCoverageAssignmentMutation, readCoverageId } from "./inputs";
import { CASTER_COVERAGE_ADMIN_PATH, type CoverageAuditEvent, type CoverageConflictResult, type CoverageHistoryResult, type CoverageMutationResult, type CoverageSearchResult } from "./contracts";

const retired = { kind: "error", message: "Casting scheduling has been retired. Casters publish their own tournament videos." } as const;
const denied = { kind: "error", message: "Your current session cannot manage verified coverage." } as const;
const unavailable = { kind: "error", message: "Coverage could not be loaded or changed. Refresh and try again." } as const;

// Stale browser bundles may still call these server actions during rollout.
export async function searchAssignmentCasters(_previous: CoverageSearchResult, _form: FormData): Promise<CoverageSearchResult> { return retired; }
export async function checkAssignmentConflicts(_previous: CoverageConflictResult, _form: FormData): Promise<CoverageConflictResult> { return retired; }

export async function saveCastingAssignment(_previous: CoverageMutationResult, form: FormData): Promise<CoverageMutationResult> {
  const actor = await currentCastingAdmin();
  if (!actor) return denied;
  const correction = parseCoverageAssignmentMutation(form);
  if (correction?.action !== "correct" || !correction.reason || !correction.covered) return retired;
  const broadcast = correction.broadcast ? parseCasterCoverageBroadcastUrl(correction.broadcast) : null;
  const recording = correction.recording ? parseCasterCoverageRecordingUrl(correction.recording) : null;
  if ((correction.broadcast && !broadcast) || (correction.recording && !recording)) {
    return { kind: "error", message: "Use a supported Twitch or YouTube broadcast and recording link." };
  }
  const result = await casterRpc<{ status: string }>("caster_media_correct_verified_history", {
    p_actor: actor, p_assignment_id: correction.assignment, p_expected_version: correction.version,
    p_covered_at: correction.covered, p_broadcast_url: broadcast, p_recording_url: recording,
    p_media_id: correction.media, p_reason: correction.reason,
  });
  if (result?.status !== "ok") return unavailable;
  revalidatePath(CASTER_COVERAGE_ADMIN_PATH);
  revalidatePath("/admin/tournaments/[tournamentId]", "page");
  revalidatePath("/caster-studio");
  revalidatePath("/casters/[slug]", "page");
  revalidatePath("/tournaments");
  return { kind: "ok", message: "Verified coverage correction recorded." };
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
