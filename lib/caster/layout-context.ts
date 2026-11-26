import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type CasterLayoutContext = {
  view: "auth" | "studio";
  legalError: "required" | "retry" | null;
};

const LIFETIME_SECONDS = 60;

function signature(payload: string): Buffer | null {
  const key = process.env.CASTER_CONTINUATION_KEY;
  if (!key) return null;
  const layoutKey = createHmac("sha256", Buffer.from(key, "base64url"))
    .update("ironclad-caster-layout-context-v1")
    .digest();
  return createHmac("sha256", layoutKey).update(payload).digest();
}

export function signCasterLayoutContext(context: CasterLayoutContext): string | null {
  const expires = Math.floor(Date.now() / 1_000) + LIFETIME_SECONDS;
  const payload = `${context.view}.${context.legalError ?? "none"}.${expires}`;
  const signed = signature(payload);
  return signed ? `${payload}.${signed.toString("base64url")}` : null;
}

export function readCasterLayoutContext(value: string | null): CasterLayoutContext | null {
  const match = /^(auth|studio)\.(required|retry|none)\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!match) return null;
  const [, view, error, expiration, encoded] = match;
  const now = Math.floor(Date.now() / 1_000);
  const expires = Number(expiration);
  if (expires <= now || expires > now + LIFETIME_SECONDS) return null;
  const expected = signature(`${view}.${error}.${expiration}`);
  const received = Buffer.from(encoded, "base64url");
  if (!expected || expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return {
    view: view === "auth" ? "auth" : "studio",
    legalError: error === "required" || error === "retry" ? error : null,
  };
}
