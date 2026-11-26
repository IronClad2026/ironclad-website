import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const CONTINUATION_COOKIE = "__Host-ironclad-caster";
export const CONTINUATION_MAX_AGE_SECONDS = 30 * 60;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isInvitationSecret(value: unknown): value is string {
  return typeof value === "string" && SECRET_PATTERN.test(value) &&
    Buffer.from(value, "base64url").toString("base64url") === value;
}

export function generateInvitationSecret() {
  return randomBytes(32).toString("base64url");
}

export function digestInvitationSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function readContinuationDigest(value: string | undefined) {
  return isInvitationSecret(value) ? digestContinuation(value) : null;
}

export function generateContinuation() {
  const value = generateInvitationSecret();
  return { value, digest: digestContinuation(value) };
}

function digestContinuation(value: string) {
  return createHash("sha256").update(`ironclad:caster:continuation:${value}`).digest("hex");
}
