import "server-only";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AccountLegalMutationBlockedError, requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isShowcaseUuid } from "@/lib/player-showcase/validation";
import { mediaConfiguration } from "./config";
import { drainHighlightCleanup } from "./cleanup";
import { getMyCombatHighlights, parseHighlightsState, record, revision, slotNumber } from "./read";
import { fetchPrivateMedia, signMediaGrant } from "./signing";
import type { HighlightResult, OwnerHighlightAccess, ReserveHighlightInput, ReserveHighlightResult } from "./types";

const codes = new Set(["saved", "reported", "conflict", "profile-required", "legal-required", "feature-disabled", "invalid-input", "upload-pending", "upload-expired", "upload-limit", "unavailable", "forbidden", "invalid-media", "too-large", "sign-in-required"]);
export const failure = (code = "unavailable"): HighlightResult => ({ ok: false, code });
export function parseHighlightReply(value: unknown): HighlightResult {
  const row = record(value);
  const state = parseHighlightsState(row?.state);
  const code = typeof row?.code === "string" && codes.has(row.code) ? row.code : "unavailable";
  return { ok: code === "saved" || code === "reported", code, ...(state ? { state } : {}) };
}
function refresh(result: HighlightResult) {
  if (result.ok) { revalidatePath("/dashboard/showcase"); if (result.state) revalidatePath("/players/" + result.state.playerId); }
  return result;
}
function legalFailure(error: unknown) { return failure(error instanceof AccountLegalMutationBlockedError ? error.reason === "required" ? "legal-required" : "unavailable" : "unavailable"); }
function validReserve(input: unknown): input is ReserveHighlightInput {
  const row = record(input);
  if (!row || !slotNumber(row.slotNumber) || !revision(row.expectedRevision) || typeof row.title !== "string" || row.title.trim().length > 64 || /[\u0000-\u001f\u007f]/.test(row.title) || typeof row.fileName !== "string" || row.fileName.length < 1 || row.fileName.length > 255 || /[/\\\u0000-\u001f]/.test(row.fileName)) return false;
  if (!revision(row.byteLength) || row.byteLength < 1 || row.byteLength > 15_000_000 || !revision(row.posterByteLength) || row.posterByteLength > 200_000 || row.declarationAccepted !== true || row.declarationVersion !== 1) return false;
  return row.contentType === "video/mp4" ? /\.mp4$/i.test(row.fileName) : row.contentType === "video/webm" && /\.webm$/i.test(row.fileName);
}
export async function reserveCombatHighlight(input: unknown): Promise<ReserveHighlightResult> {
  try {
    const session = await auth();
    if (!session.userId) return failure("sign-in-required");
    if (!validReserve(input)) return failure("invalid-input");
    const config = mediaConfiguration();
    const origin = (await headers()).get("origin");
    const token = await session.getToken();
    if (!config || !origin || !config.allowedOrigins.includes(origin) || !token) return failure("unavailable");
    await requireCurrentAccountLegalAcceptance();
    // Expired cancellations must not leave an otherwise empty editor quota-locked.
    await drainHighlightCleanup().catch(() => 0);
    const id = crypto.randomUUID();
    const expires = Math.floor(Date.now() / 1000) + 300;
    // Validate signing configuration before creating a durable reservation.
    const videoAuthorization = await signMediaGrant({ op: "upload", id, kind: "video", size: input.byteLength, type: input.contentType, origin, exp: expires });
    const posterAuthorization = input.posterByteLength ? await signMediaGrant({ op: "upload", id, kind: "poster", size: input.posterByteLength, type: "image/jpeg", origin, exp: expires }) : null;
    const { data, error } = await (await createAuthenticatedSupabaseClient()).rpc("reserve_my_player_combat_highlight", {
      p_slot_number: input.slotNumber, p_expected_revision: input.expectedRevision, p_request_id: id, p_title: input.title.trim(), p_file_name: input.fileName,
      p_content_type: input.contentType, p_byte_length: input.byteLength, p_poster_byte_length: input.posterByteLength, p_declaration_version: "v1", p_declaration_accepted: true,
    });
    if (error) return failure();
    const result = parseHighlightReply(data);
    if (!result.ok || record(data)?.uploadId !== id) return result.ok ? failure() : result;
    return { ...result, upload: { uploadId: id, videoUrl: config.origin + "/uploads/" + id + "/video", videoAuthorization, posterUrl: posterAuthorization ? config.origin + "/uploads/" + id + "/poster" : null, posterAuthorization, clerkToken: token } };
  } catch (error) { return legalFailure(error); }
}
export async function completeCombatHighlight(uploadId: unknown): Promise<HighlightResult> {
  try {
    if (!(await auth()).userId) return failure("sign-in-required");
    if (!isShowcaseUuid(uploadId) || !mediaConfiguration()) return failure("invalid-input");
    await requireCurrentAccountLegalAcceptance();
    const client = await createAuthenticatedSupabaseClient();
    const { data, error } = await client.rpc("get_my_player_combat_highlight_upload", { p_upload_id: uploadId });
    const row = record(data);
    if (error || !row || row.uploadId !== uploadId || typeof row.fileName !== "string" || !["video/mp4", "video/webm"].includes(String(row.contentType)) || !revision(row.byteLength) || !revision(row.posterByteLength) || typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= Date.now()) return failure("upload-expired");
    const { validateMedia, validatePoster, MediaValidationError } = await import("./media-validation");
    const video = await fetchPrivateMedia(uploadId, "video", row.byteLength, row.contentType as string);
    let verified;
    try {
      verified = await validateMedia(video.bytes, { fileName: row.fileName, contentType: row.contentType as string });
      if (row.posterByteLength) await validatePoster((await fetchPrivateMedia(uploadId, "poster", row.posterByteLength, "image/jpeg")).bytes);
    } catch (validationError) {
      if (!(validationError instanceof MediaValidationError)) throw validationError;
      const state = await getMyCombatHighlights();
      const slot = state?.slots.find((s) => s.pendingUploadId === uploadId);
      if (slot) await client.rpc("cancel_my_player_combat_highlight_upload", { p_upload_id: uploadId, p_expected_revision: slot.revision });
      return { ...failure("invalid-media"), ...(state ? { state: await getMyCombatHighlights() ?? state } : {}) };
    }
    // Only verified immutable bytes reach the service-only publication RPC.
    // SQL repeats current owner, legal, feature and pending-generation checks.
    const completion = await createSupabaseAdminClient().rpc("complete_player_combat_highlight_upload", { p_upload_id: uploadId, p_verified: { ...verified, etag: video.etag, hasPoster: row.posterByteLength > 0 } });
    if (completion.error) return failure();
    const result = refresh(parseHighlightReply(completion.data));
    await drainHighlightCleanup().catch(() => 0);
    return result;
  } catch (error) { return legalFailure(error); }
}
async function ownerMutation(rpc: string, args: Record<string, unknown>): Promise<HighlightResult> {
  try {
    if (!(await auth()).userId) return failure("sign-in-required");
    if (!mediaConfiguration()) return failure();
    const { data, error } = await (await createAuthenticatedSupabaseClient()).rpc(rpc, args);
    if (error) return failure();
    const result = refresh(parseHighlightReply(data));
    await drainHighlightCleanup().catch(() => 0);
    return result;
  } catch { return failure(); }
}
export async function cancelCombatHighlight(uploadId: unknown, expectedRevision: unknown) {
  if (!isShowcaseUuid(uploadId) || !revision(expectedRevision)) return failure("invalid-input");
  return ownerMutation("cancel_my_player_combat_highlight_upload", { p_upload_id: uploadId, p_expected_revision: expectedRevision });
}
export async function clearCombatHighlight(slot: unknown, expectedRevision: unknown) {
  if (!slotNumber(slot) || !revision(expectedRevision)) return failure("invalid-input");
  return ownerMutation("clear_my_player_combat_highlight", { p_slot_number: slot, p_expected_revision: expectedRevision });
}
export async function reorderCombatHighlights(slots: unknown, revisions: unknown) {
  if (!Array.isArray(slots) || !Array.isArray(revisions) || slots.length !== revisions.length || slots.length < 1 || slots.length > 3 || !slots.every(slotNumber) || !revisions.every(revision) || new Set(slots).size !== slots.length) return failure("invalid-input");
  return ownerMutation("reorder_my_player_combat_highlights", { p_slot_numbers: slots, p_expected_revisions: revisions });
}
export async function previewCombatHighlight(uploadId: unknown): Promise<OwnerHighlightAccess> {
  try {
    const session = await auth();
    if (!session.userId) return failure("sign-in-required");
    const config = mediaConfiguration();
    if (!config || !isShowcaseUuid(uploadId)) return failure("invalid-input");
    const { data, error } = await (await createAuthenticatedSupabaseClient()).rpc("can_access_my_player_combat_highlight", { p_upload_id: uploadId, p_purpose: "read" });
    if (error || data !== true) return failure("forbidden");
    const token = await session.getToken();
    return token ? { ok: true, code: "saved", videoUrl: config.origin + "/owner/" + uploadId + "/video", clerkToken: token } : failure("sign-in-required");
  } catch { return failure(); }
}
export async function reportCombatHighlight(uploadId: unknown, reason: unknown) {
  if (!isShowcaseUuid(uploadId) || typeof reason !== "string" || !["inappropriate", "harassment", "privacy", "copyright", "other"].includes(reason)) return failure("invalid-input");
  return ownerMutation("report_player_combat_highlight", { p_upload_id: uploadId, p_reason: reason });
}
