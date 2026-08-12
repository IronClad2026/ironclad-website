"use server";

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  MAX_TOURNAMENT_BANNER_BYTES,
  TOURNAMENT_BANNER_BUCKET,
  TOURNAMENT_BANNER_MIME_TYPES,
  buildTournamentBannerPublicUrl,
  createTournamentBannerPath,
  getTournamentBannerExtension,
  hasTournamentBannerSignature,
  parseTournamentBannerPath,
  parseTournamentBannerPublicUrl,
  type TournamentBannerAsset,
} from "@/lib/tournament-banner-storage";
import type {
  TournamentBracketFieldPrefix,
  TournamentBracketName,
  TournamentFormat,
  TournamentRuleFormat,
  TournamentStatus,
} from "@/lib/tournaments";
import {
  TOURNAMENT_BRACKET_CONFIGS,
  parseEloEligibilityRule,
} from "@/lib/tournaments";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

const validStatuses: TournamentStatus[] = [
  "upcoming",
  "registration_open",
  "in_progress",
  "completed",
];
const validFormats: TournamentFormat[] = ["1v1"];
const validRuleFormats: TournamentRuleFormat[] = ["format_a", "format_b"];
const validConfirmationWindows = new Set([
  1,
  5,
  15,
  30,
  60,
  120,
  360,
  720,
  1440,
]);
const TOURNAMENT_HARD_DELETE_GUARD_CODE = "P0001";
const TOURNAMENT_HARD_DELETE_GUARD_MESSAGE =
  "Tournament has launched or contains competitive history and cannot be permanently deleted.";
export type TournamentSaveState = {
  error: string | null;
};

export async function createTournamentBannerUpload(input: {
  fileName: string;
  contentType: string;
  size: number;
}) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const extension = getTournamentBannerExtension(input);
  if (!extension) {
    throw new Error(
      "Banner must be a JPG, JPEG, PNG, or WEBP image no larger than 10 MiB."
    );
  }

  const path = createTournamentBannerPath(extension);
  const supabase = createSupabaseAdminClient();
  await verifyTournamentBannerBucket(supabase);

  const { data, error } = await supabase.storage
    .from(TOURNAMENT_BANNER_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (
    error ||
    !data ||
    data.path !== path ||
    typeof data.token !== "string" ||
    data.token.length === 0
  ) {
    console.error("Tournament banner upload authorization failed.");
    throw new Error("Unable to prepare the banner upload. Try again.");
  }

  const { data: publicUrl } = supabase.storage
    .from(TOURNAMENT_BANNER_BUCKET)
    .getPublicUrl(path);
  const parsedPublicUrl = parseTournamentBannerPublicUrl(publicUrl.publicUrl);

  if (!parsedPublicUrl || parsedPublicUrl.path !== path) {
    console.error("Tournament banner public URL generation failed.");
    throw new Error("Unable to prepare the banner upload. Try again.");
  }

  return {
    bucket: TOURNAMENT_BANNER_BUCKET,
    path,
    token: data.token,
    publicUrl: parsedPublicUrl.publicUrl,
  };
}

async function verifyTournamentBannerBucket(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  try {
    const { data: bucket, error } = await supabase.storage.getBucket(
      TOURNAMENT_BANNER_BUCKET
    );
    const allowedMimeTypes = new Set(bucket?.allowed_mime_types ?? []);
    const hasExpectedMimeTypes =
      allowedMimeTypes.size === TOURNAMENT_BANNER_MIME_TYPES.length &&
      TOURNAMENT_BANNER_MIME_TYPES.every((mimeType) =>
        allowedMimeTypes.has(mimeType)
      );

    if (
      !error &&
      bucket?.id === TOURNAMENT_BANNER_BUCKET &&
      bucket.public &&
      Number(bucket.file_size_limit) === MAX_TOURNAMENT_BANNER_BYTES &&
      hasExpectedMimeTypes
    ) {
      return;
    }
  } catch {}
  console.error("Tournament banner storage configuration is invalid.");
  throw new Error("Tournament banner storage is not configured.");
}

export async function discardTournamentBannerUpload(publicUrl: string) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const banner = parseTournamentBannerPublicUrl(publicUrl);
  if (!banner) {
    return { deleted: false };
  }

  const supabase = createSupabaseAdminClient();
  try {
    if (await isTournamentBannerReferenced(supabase, banner.publicUrl)) {
      return { deleted: false };
    }
    await removeStorageObjects(supabase, TOURNAMENT_BANNER_BUCKET, [
      banner.path,
    ]);
    return { deleted: true };
  } catch {
    console.error("Tournament banner discard failed.");
    return { deleted: false };
  }
}

export async function saveTournament(
  _previousState: TournamentSaveState,
  formData: FormData
): Promise<TournamentSaveState> {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    return {
      error: "Administrator permission is required to save tournaments.",
    };
  }

  const tournamentId = getOptionalText(formData, "tournamentId");
  const title = getText(formData, "title");
  let slug = generateTournamentSlug(title);
  const description = getText(formData, "description");
  const bannerImageUrl = getText(formData, "bannerImageUrl");
  const registrationOpenAt = parseOptionalDateTime(
    formData,
    "registrationOpenAt"
  );
  const registrationCloseAt = parseOptionalDateTime(
    formData,
    "registrationCloseAt"
  );
  const grandFinalAt = parseOptionalDateTime(formData, "grandFinalAt");
  const status = getText(formData, "status") as TournamentStatus;
  const format = getText(formData, "format") as TournamentFormat;
  const ruleFormat = getText(formData, "ruleFormat") as TournamentRuleFormat;
  const resultConfirmationWindowMinutes = getInteger(
    formData,
    "resultConfirmationWindowMinutes"
  );
  const prizePool = getText(formData, "prizePool");
  const rulesUrl = getOptionalText(formData, "rulesUrl");
  const battlefyUrl = getOptionalText(formData, "battlefyUrl");
  let registrationEnabled = status === "registration_open";
  const bracketInputs = TOURNAMENT_BRACKET_CONFIGS.map((config) => ({
    config,
    enabled: formData.get(`${config.fieldPrefix}Enabled`) === "on",
    bracket: readBracket(formData, config.fieldPrefix, config.name),
  }));
  const brackets = bracketInputs.flatMap((input) =>
    input.bracket ? [input.bracket] : []
  );

  const validationError = getTournamentValidationError({
    title,
    slug,
    description,
    bannerImageUrl,
    status,
    format,
    ruleFormat,
    resultConfirmationWindowMinutes,
    prizePool,
    rulesUrl,
    battlefyUrl,
    registrationOpenAt,
    registrationCloseAt,
    grandFinalAt,
    brackets: bracketInputs,
    bracketCount: brackets.length,
  });

  if (validationError) {
    return { error: validationError };
  }

  if (
    !tournamentId &&
    status !== "upcoming" &&
    status !== "registration_open"
  ) {
    return {
      error:
        "New tournaments must begin Closed or Open. Use Launch Division to enter active competition.",
    };
  }

  const banner = parseTournamentBannerPublicUrl(bannerImageUrl);
  if (!banner) {
    return { error: "Upload a valid IronClad tournament banner." };
  }

  const supabase = createSupabaseAdminClient();
  let previousBannerUrl: string | null = null;
  try {
    if (tournamentId) {
      const existingTournament = await getExistingTournamentDetails(
        supabase,
        tournamentId
      );
      slug = existingTournament.slug;
      previousBannerUrl = existingTournament.bannerImageUrl;
      const lifecycleManagedStatus =
        status === "in_progress" || status === "completed";
      const existingLifecycleManagedStatus =
        existingTournament.status === "in_progress" ||
        existingTournament.status === "completed";

      if (
        (lifecycleManagedStatus && status !== existingTournament.status) ||
        (existingLifecycleManagedStatus && status !== existingTournament.status)
      ) {
        return {
          error:
            "Tournament lifecycle status is managed by Launch Division and match completion; it cannot be started or reopened here.",
        };
      }

      if (existingLifecycleManagedStatus) {
        registrationEnabled = existingTournament.registrationEnabled;
      }
    } else {
      slug = await getAvailableTournamentSlug(supabase, slug);
    }
  } catch {
    console.error("Tournament slug generation failed.");
    return {
      error:
        "Unable to preserve or generate the tournament URL. Rename the tournament or try again.",
    };
  }

  try {
    if (
      await isTournamentBannerReferenced(
        supabase,
        banner.publicUrl,
        tournamentId
      )
    ) {
      return {
        error: "That banner is already assigned to another tournament.",
      };
    }
  } catch {
    console.error("Tournament banner reference validation failed.");
    return { error: "The uploaded banner could not be verified. Try again." };
  }

  if (!(await isVerifiedTournamentBanner(supabase, banner))) {
    await cleanupFailedTournamentBanner(
      supabase,
      banner,
      previousBannerUrl
    );
    return {
      error:
        "The uploaded banner could not be verified. Re-upload a valid JPG, PNG, or WEBP image.",
    };
  }

  const { data, error } = await supabase.rpc("save_tournament", {
    p_tournament_id: tournamentId,
    p_title: title,
    p_slug: slug,
    p_description: description,
    p_banner_image_url: bannerImageUrl,
    p_registration_open_at: toIsoDateTime(registrationOpenAt),
    p_registration_close_at: toIsoDateTime(registrationCloseAt),
    p_start_date: null,
    p_end_date: null,
    p_status: status,
    p_format: format,
    p_prize_pool: prizePool,
    p_rules_url: rulesUrl,
    p_battlefy_url: battlefyUrl,
    p_registration_enabled: registrationEnabled,
    p_grand_final_at: toIsoDateTime(grandFinalAt),
    p_rule_format: ruleFormat,
    p_result_confirmation_window_minutes:
      resultConfirmationWindowMinutes,
    p_brackets: brackets,
  });

  if (error || !data) {
    console.error("Tournament save failed.");
    return { error: getDatabaseSaveError(error?.message) };
  }

  const savedTournamentId = String(data);
  const { data: savedTournament, error: verificationError } = await supabase
    .from("tournaments")
    .select(
      "id, title, slug, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, registration_enabled, grand_final_at, rule_format, result_confirmation_window_minutes, updated_at"
    )
    .eq("id", savedTournamentId)
    .maybeSingle();

  if (
    verificationError ||
    !savedTournament ||
    savedTournament.status !== status ||
    savedTournament.title !== title ||
    savedTournament.slug !== slug ||
    savedTournament.description !== description ||
    savedTournament.banner_image_url !== bannerImageUrl ||
    toTimestamp(savedTournament.registration_open_at) !== registrationOpenAt ||
    toTimestamp(savedTournament.registration_close_at) !==
      registrationCloseAt ||
    toTimestamp(savedTournament.grand_final_at) !== grandFinalAt ||
    savedTournament.format !== format ||
    savedTournament.rule_format !== ruleFormat ||
    savedTournament.result_confirmation_window_minutes !==
      resultConfirmationWindowMinutes ||
    savedTournament.prize_pool !== prizePool ||
    savedTournament.rules_url !== rulesUrl ||
    savedTournament.battlefy_url !== battlefyUrl ||
    savedTournament.registration_enabled !== registrationEnabled
  ) {
    console.error("Tournament save verification failed.");
    return {
      error:
        "Tournament save could not be verified. No confirmation was received from the database.",
    };
  }

  const previousBanner = previousBannerUrl
    ? parseTournamentBannerPublicUrl(previousBannerUrl)
    : null;
  if (previousBanner && previousBanner.path !== banner.path) {
    try {
      if (
        !(await isTournamentBannerReferenced(
          supabase,
          previousBanner.publicUrl
        ))
      ) {
        await removeStorageObjects(supabase, TOURNAMENT_BANNER_BUCKET, [
          previousBanner.path,
        ]);
      }
    } catch {
      console.error("Tournament banner replacement cleanup failed.");
      revalidatePath("/admin/tournaments", "page");
      revalidatePath("/tournaments");
      return {
        error:
          "The tournament was saved, but previous banner cleanup requires administrator review.",
      };
    }
  }

  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/tournaments");
  redirect(`/admin/tournaments?selected=${savedTournamentId}&notice=saved`);
}

export async function generateTournamentBracket(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const tournamentId = getText(formData, "tournamentId");
  const bracketId = getText(formData, "bracketId");

  if (!isUuid(tournamentId) || !isUuid(bracketId)) {
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=generation-failed`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("generate_tournament_bracket", {
    p_tournament_bracket_id: bracketId,
    p_generated_by: userId,
  });

  if (error) {
    console.error("Tournament bracket generation failed:", error);
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=${
        error.message.toLowerCase().includes("regenerat") ||
        error.message.toLowerCase().includes("launched")
          ? "generation-blocked"
          : "generation-failed"
      }`
    );
  }

  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/admin");
  revalidatePath("/tournaments");
  redirect(
    `/admin/tournaments?selected=${tournamentId}&notice=${
      data ? "bracket-generated" : "generation-pending"
    }`
  );
}

export async function saveBracketAssignments(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const tournamentId = getText(formData, "tournamentId");
  const generatedBracketId = getText(formData, "generatedBracketId");
  const rawAssignments = getText(formData, "assignments");
  let assignments: unknown;

  try {
    assignments = JSON.parse(rawAssignments);
  } catch {
    redirect(
      "/admin?bracketNotice=population-failed"
    );
  }

  if (
    !isUuid(tournamentId) ||
    !isUuid(generatedBracketId) ||
    !Array.isArray(assignments) ||
    assignments.length > 1024
  ) {
    redirect(
      "/admin?bracketNotice=population-failed"
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("save_bracket_assignments", {
    p_generated_bracket_id: generatedBracketId,
    p_assignments: assignments,
    p_updated_by: userId,
  });

  if (error) {
    console.error("Bracket population save failed:", error);
    redirect(
      "/admin?bracketNotice=population-failed"
    );
  }

  const expectedAssignments = new Map(
    assignments.map((assignment) => {
      const value = assignment as {
        slot_number?: number;
        registration_id?: string | null;
      };
      return [value.slot_number, value.registration_id ?? null];
    })
  );
  const { data: savedMatches, error: verificationError } = await supabase
    .from("tournament_matches")
    .select(
      "player_one_slot, player_two_slot, player_one_registration_id, player_two_registration_id"
    )
    .eq("generated_bracket_id", generatedBracketId);
  const savedAssignments = new Map<number, string | null>();

  for (const match of savedMatches ?? []) {
    if (match.player_one_slot) {
      savedAssignments.set(
        match.player_one_slot,
        match.player_one_registration_id
      );
    }
    if (match.player_two_slot) {
      savedAssignments.set(
        match.player_two_slot,
        match.player_two_registration_id
      );
    }
  }

  const assignmentsPersisted =
    !verificationError &&
    expectedAssignments.size === savedAssignments.size &&
    [...expectedAssignments].every(
      ([slot, registrationId]) =>
        slot !== undefined &&
        savedAssignments.get(slot) === registrationId
    );

  if (!assignmentsPersisted) {
    console.error("Bracket assignment verification failed:", {
      verificationError,
      expectedSlotCount: expectedAssignments.size,
      savedSlotCount: savedAssignments.size,
    });
    redirect("/admin?bracketNotice=population-failed");
  }

  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/admin");
  revalidatePath("/tournaments");
  redirect("/admin?bracketNotice=population-saved");
}

export async function launchTournamentDivision(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const tournamentBracketId = getText(formData, "tournamentBracketId");

  if (!isUuid(tournamentBracketId)) {
    redirect("/admin?bracketNotice=division-launch-failed");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("launch_tournament_division", {
    p_tournament_bracket_id: tournamentBracketId,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    console.error("Tournament division launch failed:", error.message);
    redirect("/admin?bracketNotice=division-launch-failed");
  }

  const launchResult = Array.isArray(data) ? data[0] : data;

  if (!launchResult || typeof launchResult.launched_at !== "string") {
    console.error("Tournament division launch returned no verified state.");
    redirect("/admin?bracketNotice=division-launch-failed");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
  redirect(
    `/admin?bracketNotice=${
      launchResult.already_launched === true
        ? "division-already-launched"
        : "division-launched"
    }`
  );
}

export async function deleteTournament(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const tournamentId = getText(formData, "tournamentId");
  const confirmation = getText(formData, "confirmation");

  if (!tournamentId || confirmation !== "DELETE") {
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=delete-invalid`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: targetTournament, error: targetError } = await supabase
    .from("tournaments")
    .select("banner_image_url")
    .eq("id", tournamentId)
    .maybeSingle();
  const expectedBanner = targetTournament
    ? parseTournamentBannerPublicUrl(targetTournament.banner_image_url)
    : null;

  if (targetError || !expectedBanner) {
    logStorageCleanupFailure("validate-tournament-banner", targetError);
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=delete-failed`
    );
  }

  const { data, error } = await supabase.rpc("delete_tournament_data", {
    p_tournament_id: tournamentId,
    p_deleted_by: userId,
  });

  if (isTournamentHardDeleteGuardError(error)) {
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=delete-protected`
    );
  }

  if (error || !data) {
    logStorageCleanupFailure("delete-tournament-data", error);
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=delete-failed`
    );
  }

  const deletion = data as {
    job_id: string;
    proof_paths?: string[];
    banner_paths?: string[];
  };
  const proofPaths = getStoragePaths(deletion.proof_paths);

  try {
    const bannerPaths = getTournamentBannerPaths(deletion.banner_paths);
    if (
      bannerPaths.length !== 1 ||
      bannerPaths[0] !== expectedBanner.path
    ) {
      throw new Error("Invalid tournament banner cleanup manifest.");
    }
    await removeTournamentStorage(supabase, proofPaths, bannerPaths);
    const { error: jobCleanupError } = await supabase
      .from("tournament_deletion_jobs")
      .delete()
      .eq("id", deletion.job_id);

    if (jobCleanupError) {
      throw jobCleanupError;
    }
  } catch (storageError) {
    logStorageCleanupFailure("initial-cleanup", storageError);
    await supabase
      .from("tournament_deletion_jobs")
      .update({
        status: "storage_failed",
        error_message: "Tournament storage cleanup could not be verified.",
      })
      .eq("id", deletion.job_id);
    revalidateTournamentDeletionPaths();
    redirect("/admin/tournaments?notice=delete-storage-failed");
  }

  revalidateTournamentDeletionPaths();
  redirect("/admin/tournaments?notice=deleted");
}

export async function retryTournamentStorageCleanup(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const jobId = getText(formData, "jobId");
  if (!jobId) {
    redirect("/admin/tournaments?notice=cleanup-failed");
  }

  const supabase = createSupabaseAdminClient();
  const { data: job, error } = await supabase
    .from("tournament_deletion_jobs")
    .select("id, proof_paths, banner_paths")
    .eq("id", jobId)
    .eq("status", "storage_failed")
    .maybeSingle();

  if (error || !job) {
    logStorageCleanupFailure("load-cleanup-job", error);
    redirect("/admin/tournaments?notice=cleanup-failed");
  }

  try {
    await removeTournamentStorage(
      supabase,
      getStoragePaths(job.proof_paths),
      getTournamentBannerPaths(job.banner_paths)
    );
    const { error: cleanupError } = await supabase
      .from("tournament_deletion_jobs")
      .delete()
      .eq("id", job.id);

    if (cleanupError) throw cleanupError;
  } catch (storageError) {
    logStorageCleanupFailure("retry-cleanup", storageError);
    await supabase
      .from("tournament_deletion_jobs")
      .update({
        error_message: "Tournament storage cleanup could not be verified.",
      })
      .eq("id", job.id);
    redirect("/admin/tournaments?notice=cleanup-failed");
  }

  revalidateTournamentDeletionPaths();
  redirect("/admin/tournaments?notice=cleanup-completed");
}

function getStoragePaths(paths: unknown) {
  return Array.isArray(paths)
    ? paths.filter(
        (path): path is string => typeof path === "string" && path.length > 0
      )
    : [];
}

function getTournamentBannerPaths(paths: unknown) {
  const bannerPaths = getStoragePaths(paths);
  if (
    !Array.isArray(paths) ||
    bannerPaths.length !== paths.length ||
    bannerPaths.some((path) => !parseTournamentBannerPath(path))
  ) {
    throw new Error("Invalid tournament banner cleanup manifest.");
  }
  return bannerPaths;
}

async function removeTournamentStorage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  proofPaths: string[],
  bannerPaths: string[]
) {
  const verifiedBannerPaths = getTournamentBannerPaths(bannerPaths);
  const unreferencedBannerPaths: string[] = [];

  for (const path of verifiedBannerPaths) {
    const publicUrl = buildTournamentBannerPublicUrl(path);
    if (!publicUrl) {
      throw new Error("Invalid tournament banner cleanup manifest.");
    }
    if (!(await isTournamentBannerReferenced(supabase, publicUrl))) {
      unreferencedBannerPaths.push(path);
    }
  }

  await removeStorageObjects(supabase, "match-proofs", proofPaths);
  await removeStorageObjects(
    supabase,
    TOURNAMENT_BANNER_BUCKET,
    unreferencedBannerPaths
  );
}

async function removeStorageObjects(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  paths: string[]
) {
  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await supabase.storage
      .from(bucket)
      .remove(chunk);

    if (error) throw error;
  }

  for (const path of paths) {
    const parts = path.split("/");
    const fileName = parts.pop();
    if (!fileName) continue;

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(parts.join("/"), { limit: 1, search: fileName });

    if (error) throw error;
    if (data.some((object) => object.name === fileName)) {
      throw new Error("Storage cleanup verification failed.");
    }
  }
}

function revalidateTournamentDeletionPaths() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
}

function logStorageCleanupFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "CLEANUP_FAILED";

  console.error("Tournament storage cleanup failed.", { operation, code });
}

function isTournamentHardDeleteGuardError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === TOURNAMENT_HARD_DELETE_GUARD_CODE &&
      "message" in error &&
      error.message === TOURNAMENT_HARD_DELETE_GUARD_MESSAGE
  );
}

function readBracket(
  formData: FormData,
  fieldPrefix: TournamentBracketFieldPrefix,
  name: TournamentBracketName
) {
  if (formData.get(`${fieldPrefix}Enabled`) !== "on") {
    return null;
  }

  const eloRules = getText(formData, `${fieldPrefix}EloRules`);
  const maxPlayers = Number(getText(formData, `${fieldPrefix}MaxPlayers`));

  if (
    !eloRules ||
    eloRules.length > 500 ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < 8 ||
    maxPlayers > 1024
  ) {
    return null;
  }

  return {
    name,
    elo_rules: eloRules,
    max_players: maxPlayers,
  };
}

function getText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getOptionalText(formData: FormData, field: string) {
  return getText(formData, field) || null;
}

function generateTournamentSlug(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || `tournament-${randomUUID().slice(0, 8)}`;
}

async function getAvailableTournamentSlug(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  baseSlug: string,
) {
  let candidate = baseSlug;

  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const query = supabase
      .from("tournaments")
      .select("id")
      .eq("slug", candidate)
      .limit(1);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
  }

  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

async function getExistingTournamentDetails(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tournamentId: string
) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("slug, banner_image_url, status, registration_enabled")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (
    !data?.slug ||
    !data.banner_image_url ||
    !validStatuses.includes(data.status as TournamentStatus) ||
    typeof data.registration_enabled !== "boolean"
  ) {
    throw new Error("Tournament not found.");
  }

  return {
    bannerImageUrl: data.banner_image_url,
    registrationEnabled: data.registration_enabled,
    slug: data.slug,
    status: data.status as TournamentStatus,
  };
}

async function isTournamentBannerReferenced(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  publicUrl: string,
  excludedTournamentId?: string | null
) {
  let query = supabase
    .from("tournaments")
    .select("id")
    .eq("banner_image_url", publicUrl)
    .limit(1);

  if (excludedTournamentId) {
    query = query.neq("id", excludedTournamentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return Boolean(data?.length);
}

async function cleanupFailedTournamentBanner(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  banner: TournamentBannerAsset,
  previousBannerUrl: string | null
) {
  const previousBanner = previousBannerUrl
    ? parseTournamentBannerPublicUrl(previousBannerUrl)
    : null;
  if (previousBanner?.path === banner.path) return;

  try {
    if (await isTournamentBannerReferenced(supabase, banner.publicUrl)) return;
    await removeStorageObjects(supabase, TOURNAMENT_BANNER_BUCKET, [
      banner.path,
    ]);
  } catch {
    console.error("Tournament banner verification cleanup failed.");
  }
}

function getInteger(formData: FormData, field: string) {
  const value = Number(getText(formData, field));
  return Number.isInteger(value) ? value : null;
}

function getTournamentValidationError(input: {
  title: string;
  slug: string;
  description: string;
  bannerImageUrl: string;
  status: TournamentStatus;
  format: TournamentFormat;
  ruleFormat: TournamentRuleFormat;
  resultConfirmationWindowMinutes: number | null;
  prizePool: string;
  rulesUrl: string | null;
  battlefyUrl: string | null;
  registrationOpenAt: number | null;
  registrationCloseAt: number | null;
  grandFinalAt: number | null;
  brackets: {
    config: (typeof TOURNAMENT_BRACKET_CONFIGS)[number];
    enabled: boolean;
    bracket: ReturnType<typeof readBracket>;
  }[];
  bracketCount: number;
}) {
  if (!input.title) return "Tournament title is required.";
  if (input.title.length > 160) {
    return "Tournament title must be 160 characters or fewer.";
  }
  if (!input.slug) return "Tournament slug is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    return "Tournament slug may contain only lowercase letters, numbers, and single hyphens.";
  }
  if (!input.description) return "Tournament description is required.";
  if (input.description.length > 5000) {
    return "Tournament description must be 5,000 characters or fewer.";
  }
  if (!input.bannerImageUrl) return "A tournament banner image is required.";
  if (!parseTournamentBannerPublicUrl(input.bannerImageUrl)) {
    return "Upload a valid IronClad tournament banner.";
  }
  if (!validStatuses.includes(input.status)) {
    return "Select a valid tournament status.";
  }
  if (!validFormats.includes(input.format)) {
    return "Only 1v1 tournaments are supported until team rosters and team-based matches are implemented.";
  }
  if (!validRuleFormats.includes(input.ruleFormat)) {
    return "Select a valid tournament rule format.";
  }
  if (
    input.resultConfirmationWindowMinutes === null ||
    !validConfirmationWindows.has(input.resultConfirmationWindowMinutes)
  ) {
    return "Select a valid result confirmation window.";
  }
  if (input.prizePool.length > 2000) {
    return "Prize information must be 2,000 characters or fewer.";
  }
  if (input.rulesUrl && !isHttpUrl(input.rulesUrl)) {
    return "Rules URL must begin with http:// or https://.";
  }
  if (input.battlefyUrl && !isHttpUrl(input.battlefyUrl)) {
    return "Battlefy URL must begin with http:// or https://.";
  }
  if (
    input.registrationOpenAt !== null &&
    input.registrationCloseAt !== null &&
    input.registrationOpenAt >= input.registrationCloseAt
  ) {
    return "Registration opening time must be before the closing time.";
  }
  for (const bracketInput of input.brackets) {
    if (bracketInput.enabled && !bracketInput.bracket) {
      return `${bracketInput.config.label} requires ELO rules and a maximum player count between 8 and 1,024.`;
    }
    if (
      bracketInput.bracket &&
      !parseEloEligibilityRule(bracketInput.bracket.elo_rules)
    ) {
      return `${bracketInput.config.label} ELO rules must use a supported range, upper/lower limit, or unrestricted rule.`;
    }
  }
  if (input.bracketCount === 0) {
    return "Enable and configure at least one tournament bracket.";
  }
  return null;
}

function getDatabaseSaveError(message?: string) {
  if (!message) {
    return "The database did not accept the tournament. Confirm the latest migrations are applied and try again.";
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "A tournament with this generated URL already exists. Rename the tournament or try again.";
  }
  if (normalized.includes("permission") || normalized.includes("policy")) {
    return "Database permission denied while saving the tournament.";
  }
  if (normalized.includes("function") && normalized.includes("not exist")) {
    return "The tournament save database function is missing. Apply the latest Supabase migrations.";
  }
  if (
    normalized.includes("registration and tournament start dates are required")
  ) {
    return "The database is still using the old required-date save function. Apply migration 20260612092000_optional_tournament_dates.sql.";
  }
  if (
    normalized.includes("cannot remove the") &&
    normalized.includes("normal tournament edit")
  ) {
    return "A populated tournament bracket cannot be removed during a normal edit.";
  }
  if (
    normalized.includes("required when registration is open")
  ) {
    return "Registration dates are required while registration is open.";
  }
  if (
    normalized.includes("cannot change elo rules for the") ||
    normalized.includes("cannot reduce the")
  ) {
    return "Active tournament bracket settings cannot be changed that way.";
  }
  return "The database did not accept the tournament. Try again.";
}

function parseDateTime(formData: FormData, field: string) {
  const value = getText(formData, field);
  const timestamp = new Date(`${value}:00Z`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseOptionalDateTime(formData: FormData, field: string) {
  return getText(formData, field) ? parseDateTime(formData, field) : null;
}

function toIsoDateTime(timestamp: number | null) {
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function toTimestamp(value: string | null) {
  return value ? new Date(value).getTime() : null;
}

async function isVerifiedTournamentBanner(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  banner: TournamentBannerAsset
) {
  try {
    const fileName = banner.path.slice("banners/".length);

    const { data, error } = await supabase.storage
      .from(TOURNAMENT_BANNER_BUCKET)
      .list("banners", { limit: 1, search: fileName });
    const object = data?.find((item) => item.name === fileName);
    const size = Number(object?.metadata?.size);
    const mimeType = String(object?.metadata?.mimetype ?? "");

    if (
      error ||
      !object ||
      mimeType !== banner.mimeType ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_TOURNAMENT_BANNER_BYTES
    ) {
      return false;
    }

    const publicUrl = buildTournamentBannerPublicUrl(banner.path);
    if (!publicUrl || publicUrl !== banner.publicUrl) return false;

    const response = await fetch(publicUrl, {
      headers: { Range: "bytes=0-15" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const bytes = await readImageHeader(response);
    return hasTournamentBannerSignature(bytes, banner.mimeType);
  } catch {
    console.error("Tournament banner verification failed.");
    return false;
  }
}

async function readImageHeader(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: number[] = [];
  while (chunks.length < 16) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(...value.slice(0, 16 - chunks.length));
  }
  await reader.cancel();
  return Uint8Array.from(chunks);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
