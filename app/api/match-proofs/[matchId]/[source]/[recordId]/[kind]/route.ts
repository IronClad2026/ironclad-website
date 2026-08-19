import { auth } from "@clerk/nextjs/server";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale, type LocaleScope } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

const MATCH_PROOF_BUCKET = "match-proofs";
const MAX_PROOF_RESPONSE_BYTES = 10 * 1024 * 1024;
const PROOF_CACHE_CONTROL = "private, no-store, max-age=0";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProofSource = "submission" | "report-group";
type ProofKind = "replay" | "screenshot";
type CustomClaims = {
  metadata?: {
    role?: string;
  };
};
type AuthorizedMatchDescriptor = {
  id: string;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
};
type ProofRecord = {
  matchId: string;
  tournamentId: string | null;
  storagePath: string;
};
type MatchScope = {
  matchId: string;
  tournamentId: string;
  participantRegistrationIds: string[];
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      matchId: string;
      source: string;
      recordId: string;
      kind: string;
    }>;
  }
) {
  let safeRecordId: string | null = null;
  let localeScope: LocaleScope = "player";
  const unavailableResponse = () => proofUnavailable(localeScope);

  try {
    const { userId, sessionClaims } = await auth();
    localeScope =
      (sessionClaims as CustomClaims | null)?.metadata?.role === "admin"
        ? "admin"
        : "player";
    if (!userId) {
      return unavailableResponse();
    }

    const rawParams = await params;
    const matchId = UUID_PATTERN.test(rawParams.matchId)
      ? rawParams.matchId
      : null;
    const source = parseProofSource(rawParams.source);
    const kind = parseProofKind(rawParams.kind);
    const recordId = UUID_PATTERN.test(rawParams.recordId)
      ? rawParams.recordId
      : null;

    if (
      !matchId ||
      !source ||
      !kind ||
      !recordId ||
      (source === "report-group" && kind !== "replay")
    ) {
      return unavailableResponse();
    }
    safeRecordId = recordId;
    const isAdmin = localeScope === "admin";

    const authenticatedSupabase = await createAuthenticatedSupabaseClient();
    const { data: authorizedMatch, error: authorizationError } =
      await authenticatedSupabase
        .from("tournament_matches")
        .select(
          "id, player_one_registration_id, player_two_registration_id"
        )
        .eq("id", matchId)
        .limit(1)
        .maybeSingle();
    const matchDescriptor = parseAuthorizedMatchDescriptor(
      authorizedMatch,
      matchId
    );

    if (authorizationError || !matchDescriptor) {
      return unavailableResponse();
    }

    if (!isAdmin) {
      const participantRegistrationIds = [
        matchDescriptor.player_one_registration_id,
        matchDescriptor.player_two_registration_id,
      ].filter((value): value is string => Boolean(value));

      if (participantRegistrationIds.length === 0) {
        return unavailableResponse();
      }

      const {
        data: authenticatedRegistration,
        error: authenticatedRegistrationError,
      } = await authenticatedSupabase
        .from("registrations")
        .select("id")
        .eq("clerk_user_id", userId)
        .in("id", [...new Set(participantRegistrationIds)])
        .limit(1)
        .maybeSingle();

      if (
        authenticatedRegistrationError ||
        !isOwnedRegistrationDescriptor(
          authenticatedRegistration,
          participantRegistrationIds
        )
      ) {
        return unavailableResponse();
      }
    }

    // RLS has allowed only an administrator or a same-match participant, and
    // non-admin ownership has also been checked against both the Clerk session
    // and Supabase JWT. Only now may the route create a privileged client.
    const supabase = createSupabaseAdminClient();
    const [proofRecord, matchScope] = await Promise.all([
      loadProofRecord(supabase, source, recordId, kind, matchId),
      loadMatchScope(supabase, matchId),
    ]);

    if (
      !proofRecord ||
      !matchScope ||
      proofRecord.matchId !== matchId ||
      matchScope.matchId !== matchId ||
      (proofRecord.tournamentId !== null &&
        proofRecord.tournamentId !== matchScope.tournamentId)
    ) {
      return unavailableResponse();
    }

    if (!isAdmin) {
      const authorizedRegistrationIds =
        matchScope.participantRegistrationIds;

      if (authorizedRegistrationIds.length === 0) {
        return unavailableResponse();
      }

      const { data: viewerRegistration, error: viewerRegistrationError } =
        await supabase
          .from("registrations")
          .select("id")
          .eq("clerk_user_id", userId)
          .in("id", [...new Set(authorizedRegistrationIds)])
          .limit(1)
          .maybeSingle();

      if (viewerRegistrationError || !viewerRegistration) {
        return unavailableResponse();
      }
    }

    if (!isSafeStoragePath(proofRecord.storagePath, matchScope.matchId)) {
      logProofFailure("unsafe_storage_path", recordId);
      return unavailableResponse();
    }

    const responseMetadata = getProofResponseMetadata(
      proofRecord.storagePath,
      kind
    );
    if (!responseMetadata) {
      return unavailableResponse();
    }

    const { data: proofStream, error: storageError } = await supabase.storage
      .from(MATCH_PROOF_BUCKET)
      .download(
        proofRecord.storagePath,
        {},
        {
          cache: "no-store",
          signal: request.signal,
        }
      )
      .asStream();

    if (storageError || !proofStream) {
      logProofFailure("storage_unavailable", recordId);
      return unavailableResponse();
    }

    return new Response(
      enforceMaximumStreamSize(proofStream, MAX_PROOF_RESPONSE_BYTES),
      {
        status: 200,
        headers: {
          "Cache-Control": PROOF_CACHE_CONTROL,
          "Content-Disposition": responseMetadata.contentDisposition,
          "Content-Type": responseMetadata.contentType,
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch {
    if (safeRecordId) {
      logProofFailure("internal_unavailable", safeRecordId);
    }
    return unavailableResponse();
  }
}

async function loadProofRecord(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  source: ProofSource,
  recordId: string,
  kind: ProofKind,
  matchId: string
): Promise<ProofRecord | null> {
  if (source === "submission") {
    const { data, error } = await supabase
      .from("match_result_submissions")
      .select(
        "id, match_id, replay_storage_path, screenshot_storage_path"
      )
      .eq("id", recordId)
      .eq("match_id", matchId)
      .maybeSingle();

    if (error || !data) return null;
    const storagePath =
      kind === "replay"
        ? data.replay_storage_path
        : data.screenshot_storage_path;

    return typeof storagePath === "string" && storagePath.length > 0
        ? {
          matchId: data.match_id,
          tournamentId: null,
          storagePath,
        }
      : null;
  }

  const { data, error } = await supabase
    .from("match_result_report_groups")
    .select(
      "id, match_id, tournament_id, replay_storage_path"
    )
    .eq("id", recordId)
    .eq("match_id", matchId)
    .maybeSingle();

  return !error &&
    data &&
    typeof data.replay_storage_path === "string" &&
    data.replay_storage_path.length > 0
      ? {
        matchId: data.match_id,
        tournamentId: data.tournament_id,
        storagePath: data.replay_storage_path,
      }
    : null;
}

async function loadMatchScope(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  matchId: string
): Promise<MatchScope | null> {
  const { data: match, error: matchError } = await supabase
    .from("tournament_matches")
    .select(
      "id, generated_bracket_id, player_one_registration_id, player_two_registration_id"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (matchError || !match) return null;

  const { data: generatedBracket, error: generatedBracketError } =
    await supabase
      .from("generated_brackets")
      .select("id, tournament_bracket_id")
      .eq("id", match.generated_bracket_id)
      .maybeSingle();

  if (generatedBracketError || !generatedBracket) return null;

  const { data: tournamentBracket, error: tournamentBracketError } =
    await supabase
      .from("tournament_brackets")
      .select("id, tournament_id")
      .eq("id", generatedBracket.tournament_bracket_id)
      .maybeSingle();

  if (tournamentBracketError || !tournamentBracket) return null;

  return {
    matchId: match.id,
    tournamentId: tournamentBracket.tournament_id,
    participantRegistrationIds: [
      match.player_one_registration_id,
      match.player_two_registration_id,
    ].filter((value): value is string => Boolean(value)),
  };
}

function parseAuthorizedMatchDescriptor(
  candidate: unknown,
  matchId: string
): AuthorizedMatchDescriptor | null {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return null;
  }

  const keys = Object.keys(candidate);
  if (
    keys.length !== 3 ||
    !keys.includes("id") ||
    !keys.includes("player_one_registration_id") ||
    !keys.includes("player_two_registration_id")
  ) {
    return null;
  }

  const playerOneRegistrationId = Reflect.get(
    candidate,
    "player_one_registration_id"
  );
  const playerTwoRegistrationId = Reflect.get(
    candidate,
    "player_two_registration_id"
  );

  return Reflect.get(candidate, "id") === matchId &&
    isNullableUuid(playerOneRegistrationId) &&
    isNullableUuid(playerTwoRegistrationId)
    ? {
        id: matchId,
        player_one_registration_id: playerOneRegistrationId,
        player_two_registration_id: playerTwoRegistrationId,
      }
    : null;
}

function isOwnedRegistrationDescriptor(
  candidate: unknown,
  participantRegistrationIds: readonly string[]
) {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return false;
  }

  const keys = Object.keys(candidate);
  const registrationId = Reflect.get(candidate, "id");
  return (
    keys.length === 1 &&
    keys[0] === "id" &&
    typeof registrationId === "string" &&
    participantRegistrationIds.includes(registrationId)
  );
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID_PATTERN.test(value));
}

function parseProofSource(value: string): ProofSource | null {
  return value === "submission" || value === "report-group" ? value : null;
}

function parseProofKind(value: string): ProofKind | null {
  return value === "replay" || value === "screenshot" ? value : null;
}

function isSafeStoragePath(path: string, expectedMatchId: string) {
  if (
    path.length === 0 ||
    path.length > 1024 ||
    path.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    /[\r\n]/.test(path)
  ) {
    return false;
  }

  const lowercasePath = path.toLowerCase();
  if (
    lowercasePath.includes("%2e") ||
    lowercasePath.includes("%2f")
  ) {
    return false;
  }

  const segments = path.split("/");
  return (
    segments[0] === expectedMatchId &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".."
    )
  );
}

function getProofResponseMetadata(path: string, kind: ProofKind) {
  const extension = path.split(".").pop()?.toLowerCase();

  if (kind === "replay") {
    return extension === "rec"
      ? {
          contentDisposition: 'attachment; filename="match-replay.rec"',
          contentType: "application/octet-stream",
        }
      : null;
  }

  const screenshotTypes = {
    jpeg: {
      contentDisposition: 'inline; filename="match-screenshot.jpg"',
      contentType: "image/jpeg",
    },
    jpg: {
      contentDisposition: 'inline; filename="match-screenshot.jpg"',
      contentType: "image/jpeg",
    },
    png: {
      contentDisposition: 'inline; filename="match-screenshot.png"',
      contentType: "image/png",
    },
    webp: {
      contentDisposition: 'inline; filename="match-screenshot.webp"',
      contentType: "image/webp",
    },
  } as const;

  return extension
    ? screenshotTypes[extension as keyof typeof screenshotTypes] ?? null
    : null;
}

function enforceMaximumStreamSize(
  source: ReadableStream<Uint8Array>,
  maximumBytes: number
) {
  const reader = source.getReader();
  let bytesRead = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        controller.close();
        return;
      }

      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        controller.error(new Error("Proof response exceeded its size limit."));
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

async function proofUnavailable(scope: LocaleScope) {
  let message = translate(competitionEnglish, "proof.unavailable");

  try {
    const locale = await getRequestLocale(scope);
    const dictionary = await loadDictionary(locale, "competition");
    message = translate(dictionary, "proof.unavailable");
  } catch {
    // Keep the English fallback when locale resolution is unavailable.
  }

  return new Response(message, {
    status: 404,
    headers: {
      "Cache-Control": PROOF_CACHE_CONTROL,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function logProofFailure(code: string, recordId: string) {
  console.error("Match proof access failed.", {
    operation: "match-proof-access",
    proofRecordId: recordId,
    code,
  });
}
