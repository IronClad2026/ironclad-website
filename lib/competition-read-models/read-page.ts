import "server-only";

import { CompetitionReadError } from "@/lib/competition-read-models/shared";

type PageResponse = {
  data: unknown;
  error: unknown;
  count: number | null;
  status?: number;
};

/** PostgREST returns 416/PGRST103 for a counted range beyond the result set.
 * The SDK drops Content-Range's count on error responses. Confirm an empty page
 * with a fresh, identically filtered HEAD count; never interpret provider prose.
 */
export async function readCompetitionPage(
  request: PromiseLike<PageResponse>,
  offset: number,
  confirmFilteredCount: () => PromiseLike<PageResponse>,
): Promise<PageResponse> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new CompetitionReadError("Invalid competition page offset.");
  }
  let result: PageResponse;
  try {
    result = await request;
  } catch {
    unavailable();
  }
  if (!isResponse(result)) {
    throw new CompetitionReadError(
      "Competition data returned an invalid response.",
    );
  }
  if (result.error === null) return result;
  if (
    offset === 0 ||
    result.status !== 416 ||
    !isRecord(result.error) ||
    result.error.code !== "PGRST103" ||
    result.data !== null
  ) {
    unavailable();
  }
  let confirmation: PageResponse;
  try {
    confirmation = await confirmFilteredCount();
  } catch {
    unavailable();
  }
  if (
    !isResponse(confirmation) ||
    confirmation.error !== null ||
    typeof confirmation.status !== "number" ||
    !Number.isInteger(confirmation.status) ||
    confirmation.status < 200 ||
    confirmation.status >= 300 ||
    confirmation.data !== null ||
    typeof confirmation.count !== "number" ||
    !Number.isSafeInteger(confirmation.count) ||
    confirmation.count < 0 ||
    confirmation.count > offset
  ) {
    unavailable();
  }
  return { data: [], error: null, count: confirmation.count, status: 200 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResponse(value: unknown): value is PageResponse {
  return isRecord(value) && "data" in value && "error" in value;
}

function unavailable(): never {
  throw new CompetitionReadError(
    "Competition data is unavailable.",
    "QUERY_FAILED",
  );
}
