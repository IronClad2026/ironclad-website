import "server-only";

import { parseVapidPublicKey } from "@/lib/web-push/validation";

type WebPushEnvironment = Record<string, string | undefined>;

export type WebPushConfig =
  | { mode: "disabled" }
  | {
      mode: "enabled";
      publicKey: string;
      privateKey: string;
      subject: string;
    };

export class WebPushConfigurationError extends Error {
  readonly code = "WEB_PUSH_CONFIG_INVALID";

  constructor() {
    super("Web Push configuration is invalid.");
    this.name = "WebPushConfigurationError";
  }
}

function invalidConfiguration(): never {
  throw new WebPushConfigurationError();
}

function parsePrivateKey(value: string | undefined) {
  if (!value || value !== value.trim() || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    invalidConfiguration();
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    invalidConfiguration();
  }

  return value;
}

function parseSubject(value: string | undefined) {
  if (!value || value !== value.trim() || /[\r\n]/.test(value)) {
    invalidConfiguration();
  }

  if (value.startsWith("mailto:")) {
    const address = value.slice("mailto:".length);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      invalidConfiguration();
    }
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidConfiguration();
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash
  ) {
    invalidConfiguration();
  }

  return url.toString();
}

export function loadWebPushConfig(
  environment: WebPushEnvironment = process.env
): WebPushConfig {
  const publicValue = environment.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateValue = environment.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subjectValue = environment.WEB_PUSH_VAPID_SUBJECT?.trim() ?? "";

  if (!publicValue && !privateValue && !subjectValue) {
    return { mode: "disabled" };
  }

  if (environment.WEB_PUSH_VAPID_PUBLIC_KEY !== publicValue) {
    invalidConfiguration();
  }

  const publicKey = parseVapidPublicKey(publicValue);
  if (!publicKey) invalidConfiguration();

  return {
    mode: "enabled",
    publicKey,
    privateKey: parsePrivateKey(environment.WEB_PUSH_VAPID_PRIVATE_KEY),
    subject: parseSubject(environment.WEB_PUSH_VAPID_SUBJECT),
  };
}
