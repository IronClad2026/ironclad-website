import "server-only";

import { COMPETITION_SCHEMA_VERSION } from "@/lib/competition-read-models/shared";
import { authorizePartnerApiRequest } from "@/lib/partner-api/auth";

type Endpoint =
  | "tournaments.list"
  | "tournaments.detail"
  | "players.tournaments";

export class PartnerApiError extends Error {
  constructor(
    readonly status: 400 | 404,
    readonly code:
      | "invalid_request"
      | "tournament_not_available"
      | "player_not_available",
  ) {
    super(code);
  }
}

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Vary: "X-Api-Token",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Authentication precedes input handling and every selector/client creation. */
export async function runPartnerRead(
  request: Request,
  endpoint: Endpoint,
  operation: (
    measure: <T>(read: () => Promise<T>) => Promise<T>,
  ) => Promise<object>,
): Promise<Response> {
  const start = performance.now();
  const partner = authorizePartnerApiRequest(request);
  const authMs = performance.now() - start;
  let selectorMs = 0;
  let status = 200;
  let body: object;
  try {
    if (!partner) {
      status = 401;
      body = { error: "unauthorized" };
    } else {
      body = await operation(async (read) => {
        const readStart = performance.now();
        try {
          return await read();
        } finally {
          selectorMs += performance.now() - readStart;
        }
      });
    }
  } catch (error) {
    if (error instanceof PartnerApiError) {
      status = error.status;
      body = { error: error.code };
    } else {
      status = 500;
      body = { error: "internal_error" };
    }
  }
  const totalMs = performance.now() - start;
  // Constant endpoint labels only: no URL, Relic ID, credential or source error.
  console.info("partner_api_request", {
    partner: partner?.id ?? null,
    endpoint,
    status,
    authMs: Number(authMs.toFixed(2)),
    selectorMs: Number(selectorMs.toFixed(2)),
    durationMs: Number(totalMs.toFixed(2)),
  });
  return Response.json(
    { schemaVersion: COMPETITION_SCHEMA_VERSION, ...body },
    {
      status,
      headers: {
        ...PRIVATE_HEADERS,
        "Server-Timing": `auth;dur=${authMs.toFixed(2)}, selector;dur=${selectorMs.toFixed(2)}, total;dur=${totalMs.toFixed(2)}`,
      },
    },
  );
}
