import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const CONTINUATION_COOKIE = "__Host-ironclad-caster";
const CONTINUATION_MS = 30 * 60 * 1000;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const SEALED_PATTERN = /^[A-Za-z0-9_-]{130,145}$/;

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

function getKey() {
  const encoded = process.env.CASTER_CONTINUATION_KEY;
  return isInvitationSecret(encoded) ? Buffer.from(encoded, "base64url") : null;
}

export function invitationRateKey(client: string) {
  const key = getKey();
  return key && createHmac("sha256", key).update(`prepare:${client}`).digest("hex");
}

function continuationKey(key: Buffer) {
  return createHmac("sha256", key).update("ironclad:caster:continuation:v1").digest();
}

export function createInvitationContinuation(digest: string, expiresAt: string, now = Date.now()) {
  const key = getKey();
  const until = Math.floor(Math.min(Date.parse(expiresAt), now + CONTINUATION_MS) / 1000);
  if (!key || !DIGEST_PATTERN.test(digest) || !Number.isSafeInteger(until) || until * 1000 <= now) return null;

  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", continuationKey(key), nonce);
  const encrypted = Buffer.concat([cipher.update(`${digest}.${until}`, "ascii"), cipher.final()]);
  return {
    value: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url"),
    maxAge: Math.floor(until - now / 1000),
  };
}

export function readInvitationContinuation(value: string | undefined, now = Date.now()) {
  const key = getKey();
  if (!key || !value || !SEALED_PATTERN.test(value)) return null;
  const sealed = Buffer.from(value, "base64url");
  if (sealed.toString("base64url") !== value) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", continuationKey(key), sealed.subarray(0, 12));
    decipher.setAuthTag(sealed.subarray(12, 28));
    const [digest, expiry] = Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("ascii").split(".");
    const expiresAt = Number(expiry) * 1000;
    return DIGEST_PATTERN.test(digest) && /^\d{10,12}$/.test(expiry) && expiresAt > now && expiresAt <= now + CONTINUATION_MS ? digest : null;
  } catch {
    return null;
  }
}
