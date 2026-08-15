"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

const MAP_POOL_CORRECTION_REASONS = new Set([
  "technical_issue",
  "exploit",
  "game_update",
  "competitive_integrity",
]);

export async function publishTournamentMapPools(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const tournamentId = readText(formData, "tournamentId");
  const bracketIds = readDistinctUuids(formData, "bracketIds");
  const mapIds = readDistinctUuids(formData, "mapIds");

  if (
    !isUuid(tournamentId) ||
    bracketIds.length === 0 ||
    bracketIds.length > 3 ||
    mapIds.length < 5
  ) {
    redirectToTournament(tournamentId, "map-pool-invalid");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc(
    "publish_tournament_bracket_map_pools",
    {
      p_tournament_id: tournamentId,
      p_bracket_ids: bracketIds,
      p_map_ids: mapIds,
      p_actor_clerk_user_id: userId,
    }
  );

  if (error) {
    logMapPoolFailure("publish", error);
    redirectToTournament(tournamentId, "map-pool-failed");
  }

  revalidateMapPoolPaths();
  redirectToTournament(tournamentId, "map-pool-published");
}

export async function correctTournamentMapPool(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const tournamentId = readText(formData, "tournamentId");
  const bracketId = readText(formData, "bracketId");
  const mapIds = readDistinctUuids(formData, "mapIds");
  const reason = readText(formData, "reason");
  const explanation = readText(formData, "explanation");

  if (
    !isUuid(tournamentId) ||
    !isUuid(bracketId) ||
    mapIds.length < 5 ||
    !MAP_POOL_CORRECTION_REASONS.has(reason) ||
    !explanation ||
    explanation.length > 500
  ) {
    redirectToTournament(tournamentId, "map-pool-invalid");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc(
    "correct_tournament_bracket_map_pool",
    {
      p_tournament_bracket_id: bracketId,
      p_map_ids: mapIds,
      p_reason: reason,
      p_explanation: explanation,
      p_actor_clerk_user_id: userId,
    }
  );

  if (error) {
    logMapPoolFailure("correct", error);
    redirectToTournament(tournamentId, "map-pool-failed");
  }

  revalidateMapPoolPaths();
  redirectToTournament(tournamentId, "map-pool-corrected");
}

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function readDistinctUuids(formData: FormData, field: string) {
  const values = formData
    .getAll(field)
    .map((value) => String(value).trim())
    .filter(Boolean);
  const distinctValues = [...new Set(values)];

  if (
    distinctValues.length !== values.length ||
    distinctValues.some((value) => !isUuid(value))
  ) {
    return [];
  }

  return distinctValues;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function revalidateMapPoolPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/tournaments", "page");
}

function redirectToTournament(tournamentId: string, notice: string): never {
  const selected = isUuid(tournamentId)
    ? `?selected=${encodeURIComponent(tournamentId)}&notice=${notice}`
    : `?notice=${notice}`;
  redirect(`/admin/tournaments${selected}`);
}

function logMapPoolFailure(operation: "publish" | "correct", error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "MAP_POOL_FAILED";

  console.error("Tournament map-pool operation failed.", { operation, code });
}
