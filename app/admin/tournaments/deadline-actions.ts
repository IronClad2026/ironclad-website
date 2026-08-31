"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type MatchDeadlineActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function extendTournamentMatchDeadline(
  _previousState: MatchDeadlineActionState,
  formData: FormData
): Promise<MatchDeadlineActionState> {
  const actor = await requireAdmin();
  if (!actor) return errorState("Administrator access is required.");
  await requireCurrentAccountLegalAcceptance();

  const matchId = getText(formData, "matchId");
  const extensionMinutes = Number(getText(formData, "extensionMinutes"));
  const reason = getText(formData, "reason");

  if (!isUuid(matchId)) {
    return errorState("Select a valid tournament match.");
  }
  if (
    !Number.isInteger(extensionMinutes) ||
    extensionMinutes < 1 ||
    extensionMinutes > 2_880
  ) {
    return errorState("The extension must be between 1 minute and 48 hours.");
  }
  const reasonError = validateReason(reason);
  if (reasonError) return errorState(reasonError);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "extend_tournament_match_deadline",
    {
      p_match_id: matchId,
      p_extension_minutes: extensionMinutes,
      p_reason: reason,
      p_actor_clerk_user_id: actor.userId,
    }
  );

  if (error || !isMutationResult(data)) {
    logDeadlineMutationFailure("extend", error);
    return errorState(getDeadlineMutationMessage(error?.message, "extend"));
  }

  revalidateDeadlinePaths();
  return successState("The match deadline was extended.");
}

export async function holdTournamentMatchDeadline(
  _previousState: MatchDeadlineActionState,
  formData: FormData
): Promise<MatchDeadlineActionState> {
  const actor = await requireAdmin();
  if (!actor) return errorState("Administrator access is required.");
  await requireCurrentAccountLegalAcceptance();

  const matchId = getText(formData, "matchId");
  const reason = getText(formData, "reason");

  if (!isUuid(matchId)) {
    return errorState("Select a valid tournament match.");
  }
  const reasonError = validateReason(reason);
  if (reasonError) return errorState(reasonError);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("hold_tournament_match_deadline", {
    p_match_id: matchId,
    p_reason: reason,
    p_actor_clerk_user_id: actor.userId,
  });

  if (error || !isMutationResult(data)) {
    logDeadlineMutationFailure("hold", error);
    return errorState(getDeadlineMutationMessage(error?.message, "hold"));
  }

  revalidateDeadlinePaths();
  return successState("The match deadline is now on hold.");
}

export async function releaseTournamentMatchDeadline(
  _previousState: MatchDeadlineActionState,
  formData: FormData
): Promise<MatchDeadlineActionState> {
  const actor = await requireAdmin();
  if (!actor) return errorState("Administrator access is required.");
  await requireCurrentAccountLegalAcceptance();

  const matchId = getText(formData, "matchId");

  if (!isUuid(matchId)) {
    return errorState("Select a valid tournament match.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "release_tournament_match_deadline",
    {
      p_match_id: matchId,
      p_actor_clerk_user_id: actor.userId,
    }
  );

  if (error || !isMutationResult(data)) {
    logDeadlineMutationFailure("release", error);
    return errorState(getDeadlineMutationMessage(error?.message, "release"));
  }

  revalidateDeadlinePaths();
  return successState("The match deadline resumed with its remaining time.");
}

async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  return userId && role === "admin" ? { userId } : null;
}

function validateReason(reason: string) {
  if (!reason) return "An administrator reason is required.";
  if (reason.length > 2_000) {
    return "The administrator reason must be 2,000 characters or fewer.";
  }
  return null;
}

function getDeadlineMutationMessage(
  message: string | undefined,
  operation: "extend" | "hold" | "release"
) {
  const normalized = message?.toLowerCase() ?? "";

  if (
    operation === "extend" &&
    normalized.includes("already") &&
    normalized.includes("extension")
  ) {
    return "This match has already used its one allowed extension.";
  }
  if (
    operation === "hold" &&
    normalized.includes("already") &&
    normalized.includes("hold")
  ) {
    return "This match has already used its one allowed administrative hold.";
  }
  if (
    operation === "release" &&
    ((normalized.includes("already") && normalized.includes("released")) ||
      normalized.includes("not used"))
  ) {
    return "This match does not have an active administrative hold.";
  }
  if (
    (normalized.includes("deadline") && normalized.includes("passed")) ||
    normalized.includes("expired")
  ) {
    return "The match deadline has passed and can no longer be changed.";
  }
  if (normalized.includes("pending") || normalized.includes("review")) {
    return "Resolve the active result, dispute, or no-show review first.";
  }
  if (normalized.includes("active") && normalized.includes("hold")) {
    return "Release the active administrative hold first.";
  }
  if (normalized.includes("not active") || normalized.includes("in_progress")) {
    return "Only an active matchup can be changed.";
  }
  if (normalized.includes("not on hold") || normalized.includes("no active hold")) {
    return "This match does not have an active administrative hold.";
  }

  return operation === "extend"
    ? "The match deadline could not be extended. Refresh and try again."
    : operation === "hold"
      ? "The match could not be placed on hold. Refresh and try again."
      : "The match deadline could not be resumed. Refresh and try again.";
}

function getText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isMutationResult(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revalidateDeadlinePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments/[tournamentId]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
}

function logDeadlineMutationFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "DEADLINE_FAILED";

  console.error("Tournament match deadline operation failed.", {
    operation,
    code,
  });
}

function successState(message: string): MatchDeadlineActionState {
  return { status: "success", message };
}

function errorState(message: string): MatchDeadlineActionState {
  return { status: "error", message };
}
