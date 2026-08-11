import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type TransactionalEmailWorkerAuthorization =
  | "authorized"
  | "unauthorized"
  | "unavailable";

function digestSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest();
}

function readBearerCredential(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return "";
  }

  const credential = authorizationHeader.slice("Bearer ".length);
  return credential.trim() === credential && credential.length > 0
    ? credential
    : "";
}

export function authorizeTransactionalEmailWorkerRequest(
  authorizationHeader: string | null,
  configuredSecret: string | undefined
): TransactionalEmailWorkerAuthorization {
  if (!configuredSecret || !configuredSecret.trim()) {
    return "unavailable";
  }

  const expectedDigest = digestSecret(configuredSecret);
  const suppliedDigest = digestSecret(
    readBearerCredential(authorizationHeader)
  );

  return timingSafeEqual(expectedDigest, suppliedDigest)
    ? "authorized"
    : "unauthorized";
}
