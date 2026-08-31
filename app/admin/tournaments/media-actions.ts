"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  isUuid,
  mapTournamentMediaAdminItem,
  parseTournamentMediaDatabaseRow,
  parseTournamentMediaDraftInput,
  sortTournamentMediaNewestFirst,
  type TournamentMediaAdminItem,
} from "@/lib/tournament-media";
import { getTournamentBracketDisplayName } from "@/lib/tournaments";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type TournamentMediaActionResult =
  | { ok: true }
  | { ok: false; message: string };

export type TournamentMediaMatchOption = {
  id: string;
  label: string;
};

export type AdminTournamentMediaWorkspace = {
  items: TournamentMediaAdminItem[];
  matchOptions: TournamentMediaMatchOption[];
};

const MEDIA_SELECT =
  "id, tournament_id, title, url, media_type, description, match_id, published, created_at, updated_at";
const invalidEntryMessage = "Enter valid Tournament media details.";
const operationFailedMessage =
  "The Tournament media change could not be completed. Try again.";

export async function loadAdminTournamentMediaWorkspace(
  tournamentId: string
): Promise<AdminTournamentMediaWorkspace | null> {
  await requireAdmin();
  if (!isUuid(tournamentId)) return null;

  const client = createSupabaseAdminClient();

  try {
    const [mediaResult, bracketResult] = await Promise.all([
      client
        .from("tournament_media")
        .select(MEDIA_SELECT)
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      client
        .from("tournament_brackets")
        .select("id, name")
        .eq("tournament_id", tournamentId),
    ]);

    if (
      mediaResult.error ||
      bracketResult.error ||
      !Array.isArray(mediaResult.data) ||
      !Array.isArray(bracketResult.data)
    ) {
      logTournamentMediaFailure("load-base", mediaResult.error ?? bracketResult.error);
      return null;
    }

    const mediaRows = mediaResult.data.map(parseTournamentMediaDatabaseRow);
    if (mediaRows.some((row) => row === null)) {
      logTournamentMediaFailure("load-media-shape");
      return null;
    }

    const brackets = bracketResult.data
      .map(parseBracketRow)
      .filter((row): row is BracketRow => row !== null);
    if (brackets.length !== bracketResult.data.length) {
      logTournamentMediaFailure("load-bracket-shape");
      return null;
    }

    const matchOptions = await loadTournamentMatchOptions(client, brackets);
    if (matchOptions === null) return null;

    return {
      items: sortTournamentMediaNewestFirst(
        mediaRows.map((row) => mapTournamentMediaAdminItem(row!))
      ),
      matchOptions,
    };
  } catch (error) {
    logTournamentMediaFailure("load", error);
    return null;
  }
}

export async function createTournamentMedia(
  input: unknown
): Promise<TournamentMediaActionResult> {
  await requireAdmin();
  await requireCurrentAccountLegalAcceptance();
  const parsed = parseTournamentMediaDraftInput(input);
  if (!parsed.ok || parsed.value.mediaId !== null) {
    return { ok: false, message: parsed.ok ? invalidEntryMessage : parsed.message };
  }

  const client = createSupabaseAdminClient();
  try {
    if (!(await verifyTournament(client, parsed.value.tournamentId))) {
      return { ok: false, message: "Select a valid Tournament." };
    }
    if (
      parsed.value.matchId &&
      !(await verifyMatchScope(
        client,
        parsed.value.tournamentId,
        parsed.value.matchId
      ))
    ) {
      return {
        ok: false,
        message: "Select a Match from this Tournament or leave it unassigned.",
      };
    }

    const { data, error } = await client
      .from("tournament_media")
      .insert({
        tournament_id: parsed.value.tournamentId,
        title: parsed.value.title,
        url: parsed.value.url,
        media_type: parsed.value.mediaType,
        description: parsed.value.description,
        match_id: parsed.value.matchId,
        published: parsed.value.published,
      })
      .select(MEDIA_SELECT)
      .maybeSingle();

    const row = error ? null : parseTournamentMediaDatabaseRow(data);
    if (!row || row.tournament_id !== parsed.value.tournamentId) {
      logTournamentMediaFailure("create", error);
      return { ok: false, message: operationFailedMessage };
    }

    revalidateTournamentMediaPaths(parsed.value.tournamentId);
    return { ok: true };
  } catch (error) {
    logTournamentMediaFailure("create", error);
    return { ok: false, message: operationFailedMessage };
  }
}

export async function updateTournamentMedia(
  input: unknown
): Promise<TournamentMediaActionResult> {
  await requireAdmin();
  await requireCurrentAccountLegalAcceptance();
  const parsed = parseTournamentMediaDraftInput(input);
  if (!parsed.ok || !parsed.value.mediaId) {
    return { ok: false, message: parsed.ok ? invalidEntryMessage : parsed.message };
  }

  const client = createSupabaseAdminClient();
  try {
    if (
      !(await verifyTournament(client, parsed.value.tournamentId)) ||
      !(await verifyMediaScope(
        client,
        parsed.value.tournamentId,
        parsed.value.mediaId
      ))
    ) {
      return { ok: false, message: "Select a valid media entry." };
    }
    if (
      parsed.value.matchId &&
      !(await verifyMatchScope(
        client,
        parsed.value.tournamentId,
        parsed.value.matchId
      ))
    ) {
      return {
        ok: false,
        message: "Select a Match from this Tournament or leave it unassigned.",
      };
    }

    const { data, error } = await client
      .from("tournament_media")
      .update({
        title: parsed.value.title,
        url: parsed.value.url,
        media_type: parsed.value.mediaType,
        description: parsed.value.description,
        match_id: parsed.value.matchId,
        published: parsed.value.published,
      })
      .eq("id", parsed.value.mediaId)
      .eq("tournament_id", parsed.value.tournamentId)
      .select(MEDIA_SELECT)
      .maybeSingle();

    const row = error ? null : parseTournamentMediaDatabaseRow(data);
    if (
      !row ||
      row.id !== parsed.value.mediaId ||
      row.tournament_id !== parsed.value.tournamentId
    ) {
      logTournamentMediaFailure("update", error);
      return { ok: false, message: operationFailedMessage };
    }

    revalidateTournamentMediaPaths(parsed.value.tournamentId);
    return { ok: true };
  } catch (error) {
    logTournamentMediaFailure("update", error);
    return { ok: false, message: operationFailedMessage };
  }
}

export async function setTournamentMediaPublished(
  input: unknown
): Promise<TournamentMediaActionResult> {
  await requireAdmin();
  await requireCurrentAccountLegalAcceptance();
  const parsed = parsePublicationInput(input);
  if (!parsed) return { ok: false, message: "Select a valid media entry." };

  const client = createSupabaseAdminClient();
  try {
    if (
      !(await verifyTournament(client, parsed.tournamentId)) ||
      !(await verifyMediaScope(
        client,
        parsed.tournamentId,
        parsed.mediaId
      ))
    ) {
      return { ok: false, message: "Select a valid media entry." };
    }

    const { data, error } = await client
      .from("tournament_media")
      .update({ published: parsed.published })
      .eq("id", parsed.mediaId)
      .eq("tournament_id", parsed.tournamentId)
      .select(MEDIA_SELECT)
      .maybeSingle();

    const row = error ? null : parseTournamentMediaDatabaseRow(data);
    if (
      !row ||
      row.id !== parsed.mediaId ||
      row.tournament_id !== parsed.tournamentId ||
      row.published !== parsed.published
    ) {
      logTournamentMediaFailure("publication", error);
      return { ok: false, message: operationFailedMessage };
    }

    revalidateTournamentMediaPaths(parsed.tournamentId);
    return { ok: true };
  } catch (error) {
    logTournamentMediaFailure("publication", error);
    return { ok: false, message: operationFailedMessage };
  }
}

export async function removeTournamentMedia(
  input: unknown
): Promise<TournamentMediaActionResult> {
  await requireAdmin();
  await requireCurrentAccountLegalAcceptance();
  const parsed = parseScopedEntryInput(input);
  if (!parsed) return { ok: false, message: "Select a valid media entry." };

  const client = createSupabaseAdminClient();
  try {
    if (
      !(await verifyTournament(client, parsed.tournamentId)) ||
      !(await verifyMediaScope(
        client,
        parsed.tournamentId,
        parsed.mediaId
      ))
    ) {
      return { ok: false, message: "Select a valid media entry." };
    }

    const { data, error } = await client
      .from("tournament_media")
      .delete()
      .eq("id", parsed.mediaId)
      .eq("tournament_id", parsed.tournamentId)
      .select("id")
      .maybeSingle();
    if (error || !isRecord(data) || data.id !== parsed.mediaId) {
      logTournamentMediaFailure("remove", error);
      return { ok: false, message: operationFailedMessage };
    }

    revalidateTournamentMediaPaths(parsed.tournamentId);
    return { ok: true };
  } catch (error) {
    logTournamentMediaFailure("remove", error);
    return { ok: false, message: operationFailedMessage };
  }
}

type TrustedClient = ReturnType<typeof createSupabaseAdminClient>;

type BracketRow = {
  id: string;
  name: string;
};

type GeneratedBracketRow = {
  id: string;
  tournamentBracketId: string;
};

async function loadTournamentMatchOptions(
  client: TrustedClient,
  brackets: BracketRow[]
): Promise<TournamentMediaMatchOption[] | null> {
  if (brackets.length === 0) return [];

  const bracketIds = brackets.map((bracket) => bracket.id);
  const generatedResult = await client
    .from("generated_brackets")
    .select("id, tournament_bracket_id")
    .in("tournament_bracket_id", bracketIds);
  if (generatedResult.error || !Array.isArray(generatedResult.data)) {
    logTournamentMediaFailure("load-generated-brackets", generatedResult.error);
    return null;
  }

  const generated = generatedResult.data
    .map(parseGeneratedBracketRow)
    .filter((row): row is GeneratedBracketRow => row !== null);
  if (generated.length !== generatedResult.data.length) {
    logTournamentMediaFailure("load-generated-bracket-shape");
    return null;
  }
  if (generated.length === 0) return [];

  const matchResult = await client
    .from("tournament_matches")
    .select("id, generated_bracket_id, match_number")
    .in(
      "generated_bracket_id",
      generated.map((row) => row.id)
    );
  if (matchResult.error || !Array.isArray(matchResult.data)) {
    logTournamentMediaFailure("load-matches", matchResult.error);
    return null;
  }

  const bracketNames = new Map(
    brackets.map((bracket) => [
      bracket.id,
      getTournamentBracketDisplayName(bracket.name),
    ])
  );
  const generatedToBracket = new Map(
    generated.map((row) => [row.id, row.tournamentBracketId])
  );
  const options = matchResult.data
    .map((row) => parseMatchOption(row, generatedToBracket, bracketNames))
    .filter(
      (
        row
      ): row is TournamentMediaMatchOption & {
        bracketName: string;
        matchNumber: number;
      } => row !== null
    );
  if (options.length !== matchResult.data.length) {
    logTournamentMediaFailure("load-match-shape");
    return null;
  }

  return options
    .sort(
      (left, right) =>
        left.bracketName.localeCompare(right.bracketName) ||
        left.matchNumber - right.matchNumber ||
        left.id.localeCompare(right.id)
    )
    .map(({ id, label }) => ({ id, label }));
}

async function requireAdmin() {
  const identity = await auth();
  const role = (identity.sessionClaims as CustomClaims | null)?.metadata?.role;
  if (!identity.userId || role !== "admin") throw new Error("Unauthorized");
}

async function verifyTournament(client: TrustedClient, tournamentId: string) {
  const { data, error } = await client
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) {
    logTournamentMediaFailure("verify-tournament", error);
    return false;
  }
  return isRecord(data) && data.id === tournamentId;
}

async function verifyMediaScope(
  client: TrustedClient,
  tournamentId: string,
  mediaId: string
) {
  const { data, error } = await client
    .from("tournament_media")
    .select("id, tournament_id")
    .eq("id", mediaId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (error) {
    logTournamentMediaFailure("verify-media", error);
    return false;
  }
  return (
    isRecord(data) && data.id === mediaId && data.tournament_id === tournamentId
  );
}

async function verifyMatchScope(
  client: TrustedClient,
  tournamentId: string,
  matchId: string
) {
  const matchResult = await client
    .from("tournament_matches")
    .select("id, generated_bracket_id")
    .eq("id", matchId)
    .maybeSingle();
  if (
    matchResult.error ||
    !isRecord(matchResult.data) ||
    matchResult.data.id !== matchId ||
    !isUuid(matchResult.data.generated_bracket_id)
  ) {
    if (matchResult.error) {
      logTournamentMediaFailure("verify-match", matchResult.error);
    }
    return false;
  }

  const generatedResult = await client
    .from("generated_brackets")
    .select("id, tournament_bracket_id")
    .eq("id", matchResult.data.generated_bracket_id)
    .maybeSingle();
  if (
    generatedResult.error ||
    !isRecord(generatedResult.data) ||
    generatedResult.data.id !== matchResult.data.generated_bracket_id ||
    !isUuid(generatedResult.data.tournament_bracket_id)
  ) {
    if (generatedResult.error) {
      logTournamentMediaFailure("verify-match-bracket", generatedResult.error);
    }
    return false;
  }

  const bracketResult = await client
    .from("tournament_brackets")
    .select("id, tournament_id")
    .eq("id", generatedResult.data.tournament_bracket_id)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (bracketResult.error) {
    logTournamentMediaFailure("verify-match-tournament", bracketResult.error);
    return false;
  }
  return (
    isRecord(bracketResult.data) &&
    bracketResult.data.id === generatedResult.data.tournament_bracket_id &&
    bracketResult.data.tournament_id === tournamentId
  );
}

function parseBracketRow(value: unknown): BracketRow | null {
  return isRecord(value) && isUuid(value.id) && typeof value.name === "string"
    ? { id: value.id, name: value.name }
    : null;
}

function parseGeneratedBracketRow(value: unknown): GeneratedBracketRow | null {
  return isRecord(value) &&
    isUuid(value.id) &&
    isUuid(value.tournament_bracket_id)
    ? { id: value.id, tournamentBracketId: value.tournament_bracket_id }
    : null;
}

function parseMatchOption(
  value: unknown,
  generatedToBracket: ReadonlyMap<string, string>,
  bracketNames: ReadonlyMap<string, string>
) {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.generated_bracket_id) ||
    !Number.isInteger(value.match_number) ||
    Number(value.match_number) < 1
  ) {
    return null;
  }

  const bracketId = generatedToBracket.get(value.generated_bracket_id);
  const bracketName = bracketId ? bracketNames.get(bracketId) : null;
  if (!bracketName) return null;
  const matchNumber = Number(value.match_number);

  return {
    id: value.id,
    bracketName,
    label: `${bracketName} · Match ${matchNumber}`,
    matchNumber,
  };
}

function parseScopedEntryInput(value: unknown) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "mediaId,tournamentId") return null;
  return isUuid(value.mediaId) && isUuid(value.tournamentId)
    ? { mediaId: value.mediaId, tournamentId: value.tournamentId }
    : null;
}

function parsePublicationInput(value: unknown) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "mediaId,published,tournamentId") return null;
  return isUuid(value.mediaId) &&
    isUuid(value.tournamentId) &&
    typeof value.published === "boolean"
    ? {
        mediaId: value.mediaId,
        tournamentId: value.tournamentId,
        published: value.published,
      }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revalidateTournamentMediaPaths(tournamentId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments", "page");
  revalidatePath(`/admin/tournaments/${tournamentId}`, "page");
  revalidatePath("/tournaments", "page");
}

function logTournamentMediaFailure(operation: string, error?: unknown) {
  const candidateCode =
    isRecord(error) && typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  console.error("Tournament media operation failed.", {
    operation,
    code: /^[A-Z0-9_]{3,64}$/.test(candidateCode)
      ? candidateCode
      : "TOURNAMENT_MEDIA_FAILED",
  });
}
