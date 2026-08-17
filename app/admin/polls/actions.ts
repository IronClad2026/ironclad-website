"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isUuid,
  POLL_LIMITS,
  parsePollDraftInput,
  parseSinglePollProjection,
  parsePollPublicationResult,
  type PollDraftInput,
  type PollViewerProjection,
} from "@/lib/polls";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: { role?: string };
};

export type AdminPollSnapshotResult =
  | { ok: true; poll: PollViewerProjection }
  | { ok: false };

export async function loadAdminPollSnapshot(
  pollId: unknown
): Promise<AdminPollSnapshotResult> {
  await requireAdmin();

  if (!isUuid(pollId)) {
    return { ok: false };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_admin_poll", {
    p_poll_id: pollId,
  });
  if (error) {
    logPollFailure("refresh", error);
    return { ok: false };
  }

  const poll = parseSinglePollProjection(data, "admin");
  return poll?.id === pollId ? { ok: true, poll } : { ok: false };
}

export async function savePollDraft(formData: FormData) {
  const { userId } = await requireAdmin();
  const candidate = pollDraftFromFormData(formData);
  const parsed = parsePollDraftInput(candidate);

  if (!parsed.ok) {
    redirectWithDetail("invalid-draft", parsed.error);
  }

  const input = parsed.value;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("save_poll_draft", {
    p_poll_id: input.pollId,
    p_purpose: input.purpose,
    p_audience_kind: input.audienceKind,
    p_tournament_id: input.tournamentId,
    p_tournament_bracket_id: input.tournamentBracketId,
    p_question: input.question,
    p_context: input.context,
    p_option_source: input.optionSource,
    p_options:
      input.optionSource === "coh3_map"
        ? input.mapIds.map((mapId, index) => ({
            position: index + 1,
            coh3_map_id: mapId,
          }))
        : input.optionLabels.map((label, index) => ({
            position: index + 1,
            label,
          })),
    p_max_selections: input.maxSelections,
    p_winner_count: input.winnerCount,
    p_authority: input.authority,
    p_result_visibility: input.resultVisibility,
    p_public_final_totals: input.publicFinalTotals,
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_selected_player_ids: input.selectedPlayerIds,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    logPollFailure("save", error);
    redirectWithDetail("save-failed");
  }

  revalidatePollPaths();
  redirectToPoll(readResultUuid(data, "poll_id") ?? input.pollId, "draft-saved");
}

export async function deletePollDraft(formData: FormData) {
  const { userId } = await requireAdmin();
  const pollId = readText(formData, "pollId");

  if (!isUuid(pollId)) {
    redirectWithDetail("invalid-delete");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("delete_poll_draft", {
    p_poll_id: pollId,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    logPollFailure("delete", error);
    redirectToPoll(pollId, "delete-failed");
  }

  revalidatePollPaths();
  redirectWithDetail("draft-deleted");
}

export async function previewPollEligibility(formData: FormData) {
  await requireAdmin();
  const pollId = readText(formData, "pollId");

  if (!isUuid(pollId)) {
    redirectWithDetail("invalid-preview");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("preview_poll_eligibility", {
    p_poll_id: pollId,
  });

  if (error) {
    logPollFailure("preview", error);
    redirectToPoll(pollId, "preview-failed");
  }

  const count = readNonNegativeInteger(data, "eligible_count");
  if (count === null) {
    logPollFailure("preview", { code: "INVALID_RESULT" });
    redirectToPoll(pollId, "preview-failed");
  }

  redirectToPoll(pollId, "eligibility-preview", { eligible: String(count) });
}

export async function publishPoll(formData: FormData) {
  const { userId } = await requireAdmin();
  const pollId = readText(formData, "pollId");

  if (!isUuid(pollId)) {
    redirectWithDetail("invalid-publish");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("publish_poll", {
    p_poll_id: pollId,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    logPollFailure("publish", error);
    redirectToPoll(pollId, "publish-failed");
  }

  const publication = parsePollPublicationResult(data, pollId);
  if (!publication) {
    logPollFailure("publish", { code: "INVALID_RESULT" });
    redirectToPoll(pollId, "publish-failed");
  }

  revalidatePollPaths();
  redirectToPoll(pollId, "published", {
    eligible: String(publication.eligibleCount),
  });
}

export async function cancelPoll(formData: FormData) {
  const { userId } = await requireAdmin();
  const pollId = readText(formData, "pollId");
  const reason = readText(formData, "reason");

  if (
    !isUuid(pollId) ||
    !reason ||
    reason.length > POLL_LIMITS.cancellationReason
  ) {
    redirectToPoll(isUuid(pollId) ? pollId : null, "invalid-cancel");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("cancel_poll", {
    p_poll_id: pollId,
    p_reason: reason,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    logPollFailure("cancel", error);
    redirectToPoll(pollId, "cancel-failed");
  }

  revalidatePollPaths();
  redirectToPoll(pollId, "cancelled");
}

export async function publishPollFinalDecision(formData: FormData) {
  const { userId } = await requireAdmin();
  const pollId = readText(formData, "pollId");
  const optionIds = readDistinctUuids(formData, "optionIds");
  const rationale = readOptionalText(formData, "rationale");

  if (
    !isUuid(pollId) ||
    optionIds === null ||
    optionIds.length > POLL_LIMITS.maximumWinners ||
    (rationale?.length ?? 0) > POLL_LIMITS.finalRationale
  ) {
    redirectToPoll(
      isUuid(pollId) ? pollId : null,
      "invalid-final-decision"
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("finalize_poll_decision", {
    p_poll_id: pollId,
    p_selected_option_ids: optionIds,
    p_rationale: rationale,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    logPollFailure("finalize", error);
    redirectToPoll(pollId, "final-decision-failed");
  }

  revalidatePollPaths();
  redirectToPoll(pollId, "final-decision-published");
}

async function requireAdmin() {
  const identity = await auth();
  const role = (identity.sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!identity.userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  return { userId: identity.userId };
}

function pollDraftFromFormData(formData: FormData): PollDraftInput {
  const pollId = readOptionalText(formData, "pollId");
  const tournamentId = readOptionalText(formData, "tournamentId");
  const tournamentBracketId = readOptionalText(formData, "tournamentBracketId");
  const selectedPlayerIds = readStringList(formData, "selectedPlayerIds");
  const mapIds = readStringList(formData, "mapIds");

  return {
    pollId,
    purpose: readText(formData, "purpose") as PollDraftInput["purpose"],
    audienceKind: readText(
      formData,
      "audienceKind"
    ) as PollDraftInput["audienceKind"],
    tournamentId,
    tournamentBracketId,
    question: readText(formData, "question"),
    context: readOptionalText(formData, "context"),
    optionSource: readText(
      formData,
      "optionSource"
    ) as PollDraftInput["optionSource"],
    optionLabels: readTrimmedList(formData, "optionLabels"),
    mapIds,
    selectedPlayerIds,
    maxSelections: readInteger(formData, "maxSelections"),
    winnerCount: readInteger(formData, "winnerCount"),
    authority: readText(formData, "authority") as PollDraftInput["authority"],
    resultVisibility: readText(
      formData,
      "resultVisibility"
    ) as PollDraftInput["resultVisibility"],
    publicFinalTotals: readBoolean(formData, "publicFinalTotals"),
    opensAt: readUtcDateTime(formData, "opensAt"),
    closesAt: readUtcDateTime(formData, "closesAt"),
  };
}

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function readOptionalText(formData: FormData, field: string) {
  return readText(formData, field) || null;
}

function readStringList(formData: FormData, field: string) {
  return readTrimmedList(formData, field).filter(Boolean);
}

function readTrimmedList(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .map((value) => String(value).trim());
}

function readDistinctUuids(formData: FormData, field: string) {
  const values = readStringList(formData, field);
  if (
    new Set(values).size !== values.length ||
    values.some((value) => !isUuid(value))
  ) {
    return null;
  }
  return values;
}

function readInteger(formData: FormData, field: string) {
  const value = readText(formData, field);
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function readBoolean(formData: FormData, field: string) {
  return readText(formData, field) === "true";
}

function readUtcDateTime(formData: FormData, field: string) {
  const value = readText(formData, field);
  const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00.000Z`
    : value;
  const timestamp = new Date(candidate);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : "";
}

function readResultUuid(data: unknown, field: string) {
  if (!data || typeof data !== "object") {
    return null;
  }
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "string" && isUuid(value) ? value : null;
}

function readNonNegativeInteger(data: unknown, field: string) {
  if (!data || typeof data !== "object") {
    return null;
  }
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function revalidatePollPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/polls", "page");
  revalidatePath("/dashboard", "page");
  revalidatePath("/tournaments", "page");
}

function redirectWithDetail(notice: string, detail?: string): never {
  const suffix = detail ? `&detail=${encodeURIComponent(detail)}` : "";
  redirect(`/admin/polls?notice=${notice}${suffix}`);
}

function redirectToPoll(
  pollId: string | null,
  notice: string,
  extra: Record<string, string> = {}
): never {
  const params = new URLSearchParams({ notice, ...extra });
  if (pollId) {
    params.set("selected", pollId);
  }
  redirect(`/admin/polls?${params.toString()}`);
}

function logPollFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9_]{3,32}$/.test(candidateCode)
    ? candidateCode
    : "POLL_OPERATION_FAILED";

  console.error("Polls & Decisions Admin operation failed.", {
    operation,
    code,
  });
}
