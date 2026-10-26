import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPETITION_SCHEMA_VERSION = "ironclad.competition.v1" as const;
export const IRONCLAD_PUBLIC_ORIGIN = "https://www.ironcladtournaments.com";

/** Internal server-only reads. No client creation, auth mutation or lazy reconciliation. */
export type CompetitionReadClient = Pick<SupabaseClient, "from">;

export const COMPETITION_READ_LIMITS = {
  tournaments: 10,
  history: 10,
  rows: 999,
} as const;

export type CompetitionReadErrorCode =
  | "QUERY_FAILED"
  | "INVALID_DATA"
  | "LIMIT_EXCEEDED";

/** Keep provider messages and row contents out of any future external error mapping. */
export class CompetitionReadError extends Error {
  constructor(
    message: string,
    public readonly code: CompetitionReadErrorCode = "INVALID_DATA",
  ) {
    super(message);
    this.name = "CompetitionReadError";
  }
}

/** Callers request maxRows + 1 and parse explicit source projections into types. */
export async function readCompetitionRows<T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  maxRows: number,
  parse: (row: unknown) => T,
): Promise<T[]> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 999) {
    throw new CompetitionReadError("Invalid competition read bound.");
  }
  let result: { data: unknown; error: unknown };
  try {
    result = await request;
  } catch {
    throw new CompetitionReadError(
      "Competition data is unavailable.",
      "QUERY_FAILED",
    );
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("data" in result) ||
    !("error" in result)
  ) {
    throw new CompetitionReadError(
      "Competition data returned an invalid response.",
    );
  }
  if (result.error) {
    throw new CompetitionReadError(
      "Competition data is unavailable.",
      "QUERY_FAILED",
    );
  }
  if (!Array.isArray(result.data)) {
    throw new CompetitionReadError(
      "Competition data returned an invalid response.",
    );
  }
  if (result.data.length > maxRows) {
    throw new CompetitionReadError(
      "Competition read limit exceeded.",
      "LIMIT_EXCEEDED",
    );
  }
  try {
    return result.data.map(parse);
  } catch (error) {
    if (error instanceof CompetitionReadError) throw error;
    throw new CompetitionReadError("Competition data returned an invalid row.");
  }
}
