"use server";

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  TournamentFormat,
  TournamentRuleFormat,
  TournamentStatus,
} from "@/lib/tournaments";
import { parseEloEligibilityRule } from "@/lib/tournaments";

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
const TOURNAMENT_BANNER_BUCKET = "tournament-banners";
const MAX_TOURNAMENT_BANNER_BYTES = 100 * 1024 * 1024;
const TOURNAMENT_BANNER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const bannerExtensionsByMimeType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export type TournamentSaveState = {
  error: string | null;
};

export async function createTournamentBannerUpload(input: {
  fileName: string;
  contentType: string;
  size: number;
  tournamentId?: string | null;
}) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const extension = bannerExtensionsByMimeType.get(input.contentType);
  const suppliedExtension = input.fileName.split(".").pop()?.toLowerCase();
  const validExtensions =
    input.contentType === "image/jpeg" ? ["jpg", "jpeg"] : [extension];

  if (
    !extension ||
    !suppliedExtension ||
    !validExtensions.includes(suppliedExtension) ||
    !Number.isFinite(input.size) ||
    input.size <= 0 ||
    input.size > MAX_TOURNAMENT_BANNER_BYTES
  ) {
    throw new Error(
      "Banner must be a JPG, JPEG, PNG, or WEBP image no larger than 100 MB."
    );
  }

  const folder = input.tournamentId ?? `drafts/${userId}`;
  const path = `${folder}/${randomUUID()}.${extension}`;
  const supabase = createSupabaseAdminClient();
  await ensureTournamentBannerBucket(supabase);

  const { data, error } = await supabase.storage
    .from(TOURNAMENT_BANNER_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("Tournament banner upload authorization failed:", error);
    throw new Error(
      `Unable to prepare the banner upload${
        error?.message ? `: ${error.message}` : "."
      }`
    );
  }

  const { data: publicUrl } = supabase.storage
    .from(TOURNAMENT_BANNER_BUCKET)
    .getPublicUrl(path);

  return {
    bucket: TOURNAMENT_BANNER_BUCKET,
    path,
    token: data.token,
    publicUrl: publicUrl.publicUrl,
  };
}

async function ensureTournamentBannerBucket(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data: bucket, error: lookupError } = await supabase.storage.getBucket(
    TOURNAMENT_BANNER_BUCKET
  );

  if (bucket) return;

  if (lookupError && !isMissingStorageBucketError(lookupError.message)) {
    console.error("Tournament banner bucket lookup failed:", lookupError);
    throw new Error("Unable to verify tournament banner storage.");
  }

  const { error: createError } = await supabase.storage.createBucket(
    TOURNAMENT_BANNER_BUCKET,
    {
      public: true,
      fileSizeLimit: null,
      allowedMimeTypes: TOURNAMENT_BANNER_MIME_TYPES,
    }
  );

  if (
    createError &&
    !createError.message.toLowerCase().includes("already exists")
  ) {
    console.error("Tournament banner bucket creation failed:", createError);
    throw new Error(
      "Tournament banner storage is not configured. Apply the tournament banner storage migration."
    );
  }
}

function isMissingStorageBucketError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("not found") || normalized.includes("does not exist");
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
  const slug = getText(formData, "slug").toLowerCase();
  const description = getText(formData, "description");
  const bannerImageUrl = getText(formData, "bannerImageUrl");
  const registrationOpenAt = parseOptionalDateTime(
    formData,
    "registrationOpenAt"
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
  const registrationEnabled = status === "registration_open";
  const mainEnabled = formData.get("mainEnabled") === "on";
  const challengeEnabled = formData.get("challengeEnabled") === "on";
  const mainBracket = readBracket(formData, "main", "Main");
  const challengeBracket = readBracket(
    formData,
    "challenge",
    "Challenge"
  );
  const brackets = [mainBracket, challengeBracket].filter(
    (bracket) => bracket !== null
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
    grandFinalAt,
    mainEnabled,
    challengeEnabled,
    mainBracket,
    challengeBracket,
    bracketCount: brackets.length,
  });

  if (validationError) {
    return { error: validationError };
  }

  const supabase = createSupabaseAdminClient();
  if (
    bannerImageUrl.includes(
      `/storage/v1/object/public/${TOURNAMENT_BANNER_BUCKET}/`
    ) &&
    !(await isVerifiedTournamentBanner(supabase, bannerImageUrl))
  ) {
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
    p_registration_close_at: null,
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
    console.error("Tournament save failed:", error);
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
    console.error("Tournament save verification failed:", {
      verificationError,
      savedTournament,
    });
    return {
      error: verificationError?.message
        ? `Tournament saved but verification failed: ${verificationError.message}`
        : "Tournament save could not be verified. No confirmation was received from the database.",
    };
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

  if (!tournamentId || !bracketId) {
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=generation-failed`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: existingGenerated, error: lookupError } = await supabase
    .from("generated_brackets")
    .select("id")
    .eq("tournament_bracket_id", bracketId)
    .maybeSingle();

  if (lookupError) {
    console.error("Generated bracket lookup failed:", lookupError);
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=generation-failed`
    );
  }

  const { data, error } = existingGenerated
    ? await supabase.rpc("repair_generated_bracket_matches", {
        p_generated_bracket_id: existingGenerated.id,
        p_repaired_by: userId,
      })
    : await supabase.rpc("generate_tournament_bracket", {
        p_tournament_bracket_id: bracketId,
        p_generated_by: userId,
      });

  if (error) {
    console.error("Tournament bracket generation failed:", error);
    redirect(
      `/admin/tournaments?selected=${tournamentId}&notice=${
        error.message.includes("Bracket regeneration blocked")
          ? "generation-blocked"
          : "generation-failed"
      }`
    );
  }

  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/tournaments");
  redirect(
    `/admin/tournaments?selected=${tournamentId}&notice=${
      existingGenerated
        ? "bracket-repaired"
        : data
          ? "bracket-generated"
          : "generation-pending"
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
    !tournamentId ||
    !generatedBracketId ||
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
  const { data, error } = await supabase.rpc("delete_tournament_data", {
    p_tournament_id: tournamentId,
    p_deleted_by: userId,
  });

  if (error || !data) {
    console.error("Tournament database deletion failed:", error);
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
  const bannerPaths = getStoragePaths(deletion.banner_paths);

  try {
    await removeTournamentStorage(supabase, proofPaths, bannerPaths);
    const { error: jobCleanupError } = await supabase
      .from("tournament_deletion_jobs")
      .delete()
      .eq("id", deletion.job_id);

    if (jobCleanupError) {
      throw jobCleanupError;
    }
  } catch (storageError) {
    console.error("Tournament storage cleanup failed:", storageError);
    await supabase
      .from("tournament_deletion_jobs")
      .update({
        status: "storage_failed",
        error_message: getErrorMessage(storageError),
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
    console.error("Tournament cleanup job lookup failed:", error);
    redirect("/admin/tournaments?notice=cleanup-failed");
  }

  try {
    await removeTournamentStorage(
      supabase,
      getStoragePaths(job.proof_paths),
      getStoragePaths(job.banner_paths)
    );
    const { error: cleanupError } = await supabase
      .from("tournament_deletion_jobs")
      .delete()
      .eq("id", job.id);

    if (cleanupError) throw cleanupError;
  } catch (storageError) {
    console.error("Tournament storage cleanup retry failed:", storageError);
    await supabase
      .from("tournament_deletion_jobs")
      .update({ error_message: getErrorMessage(storageError) })
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

async function removeTournamentStorage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  proofPaths: string[],
  bannerPaths: string[]
) {
  await removeStorageObjects(supabase, "match-proofs", proofPaths);
  await removeStorageObjects(
    supabase,
    TOURNAMENT_BANNER_BUCKET,
    bannerPaths
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
      throw new Error(
        `${bucket} object still exists after deletion: ${path}`
      );
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2000) : String(error);
}

function readBracket(
  formData: FormData,
  fieldPrefix: "main" | "challenge",
  name: "Main" | "Challenge"
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
    maxPlayers < 2 ||
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

function getOptionalText(formData: FormData, field: string) {
  return getText(formData, field) || null;
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
  grandFinalAt: number | null;
  mainEnabled: boolean;
  challengeEnabled: boolean;
  mainBracket: ReturnType<typeof readBracket>;
  challengeBracket: ReturnType<typeof readBracket>;
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
  if (!isAssetUrl(input.bannerImageUrl)) {
    return "Banner image must be an uploaded banner, a site-relative path, or a valid HTTP/HTTPS URL.";
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
  if (input.mainEnabled && !input.mainBracket) {
    return "Main bracket requires ELO rules and a maximum player count between 2 and 1,024.";
  }
  if (input.challengeEnabled && !input.challengeBracket) {
    return "Challenge bracket requires ELO rules and a maximum player count between 2 and 1,024.";
  }
  if (
    input.mainBracket &&
    !parseEloEligibilityRule(input.mainBracket.elo_rules)
  ) {
    return "Main bracket ELO rules must use a supported range, upper/lower limit, or unrestricted rule.";
  }
  if (
    input.challengeBracket &&
    !parseEloEligibilityRule(input.challengeBracket.elo_rules)
  ) {
    return "Challenge bracket ELO rules must use a supported range, upper/lower limit, or unrestricted rule.";
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
    return "A tournament with this slug already exists. Choose a different slug.";
  }
  if (normalized.includes("permission") || normalized.includes("policy")) {
    return `Database permission denied: ${message}`;
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
    return message;
  }
  if (
    normalized.includes("required when registration is open")
  ) {
    return message;
  }
  if (
    normalized.includes("cannot change elo rules for the") ||
    normalized.includes("cannot reduce the")
  ) {
    return message;
  }
  return `Database error: ${message}`;
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
  publicUrl: string
) {
  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${TOURNAMENT_BANNER_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return false;

    const path = decodeURIComponent(
      url.pathname.slice(markerIndex + marker.length)
    );
    const pathParts = path.split("/");
    const fileName = pathParts.pop();
    if (!fileName || pathParts.length === 0) return false;

    const { data, error } = await supabase.storage
      .from(TOURNAMENT_BANNER_BUCKET)
      .list(pathParts.join("/"), { limit: 1, search: fileName });
    const object = data?.find((item) => item.name === fileName);
    const size = Number(object?.metadata?.size);
    const mimeType = String(object?.metadata?.mimetype ?? "");

    if (
      error ||
      !object ||
      !bannerExtensionsByMimeType.has(mimeType) ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_TOURNAMENT_BANNER_BYTES
    ) {
      return false;
    }

    const response = await fetch(publicUrl, {
      headers: { Range: "bytes=0-15" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const bytes = await readImageHeader(response);
    return hasImageSignature(bytes, mimeType);
  } catch (error) {
    console.error("Tournament banner verification failed:", error);
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

function hasImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }

  return false;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAssetUrl(value: string) {
  return value.startsWith("/") || isHttpUrl(value);
}
