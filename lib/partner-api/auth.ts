import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type PartnerApiIdentity = { id: "coh3stats" };

type PartnerTokenEnvironment = Readonly<{
  COH3STATS_API_TOKEN?: string;
}>;

// One named, read-only partner. Credentials are server configuration, never
// request-supplied partner IDs, Clerk sessions or shared worker credentials.
const PARTNERS = [
  { id: "coh3stats", tokenVariable: "COH3STATS_API_TOKEN" },
] as const;

function validToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 256 &&
    // Visible ASCII, excluding comma (including duplicate-header joining).
    /^[\x21-\x2b\x2d-\x7e]+$/.test(value)
  );
}

function digestToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

/** Missing, malformed and incorrect credentials all fail closed identically. */
export function authorizePartnerApiRequest(
  request: Pick<Request, "headers">,
  environment: PartnerTokenEnvironment = {
    COH3STATS_API_TOKEN: process.env.COH3STATS_API_TOKEN,
  },
): PartnerApiIdentity | null {
  const suppliedToken = request.headers.get("x-api-token");
  if (!validToken(suppliedToken)) return null;

  for (const partner of PARTNERS) {
    const configuredToken = environment[partner.tokenVariable];
    if (!validToken(configuredToken)) continue;
    const expectedDigest = digestToken(configuredToken);
    const suppliedDigest = digestToken(suppliedToken);
    if (timingSafeEqual(expectedDigest, suppliedDigest)) {
      return { id: partner.id };
    }
  }
  return null;
}
