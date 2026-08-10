import "server-only";

export const TRANSACTIONAL_EMAIL_MODES = [
  "disabled",
  "allowlist",
  "enabled",
] as const;

export type TransactionalEmailMode =
  (typeof TRANSACTIONAL_EMAIL_MODES)[number];

type TransactionalEmailEnvironment = Record<string, string | undefined>;

type DisabledTransactionalEmailConfig = {
  mode: "disabled";
  resendApiKey: null;
  from: null;
  replyTo: null;
  appOrigin: null;
  allowedClerkUserIds: ReadonlySet<string>;
  workerSecret: string;
};

type DeliveryTransactionalEmailConfig = {
  mode: "allowlist" | "enabled";
  resendApiKey: string;
  from: string;
  replyTo: string;
  appOrigin: string;
  allowedClerkUserIds: ReadonlySet<string>;
  workerSecret: string;
};

export type TransactionalEmailConfig =
  | DisabledTransactionalEmailConfig
  | DeliveryTransactionalEmailConfig;

export class TransactionalEmailConfigurationError extends Error {
  readonly code = "EMAIL_CONFIG_INVALID";

  constructor() {
    super("Transactional email configuration is invalid.");
    this.name = "TransactionalEmailConfigurationError";
  }
}

function invalidConfiguration(): never {
  throw new TransactionalEmailConfigurationError();
}

function requireNonblank(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized || (value !== undefined && /[\r\n]/.test(value))) {
    invalidConfiguration();
  }

  return normalized;
}

function parseMode(value: string | undefined): TransactionalEmailMode {
  if (
    value !== "disabled" &&
    value !== "allowlist" &&
    value !== "enabled"
  ) {
    invalidConfiguration();
  }

  return value;
}

function parseAppOrigin(value: string | undefined) {
  const normalized = requireNonblank(value);
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    invalidConfiguration();
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    invalidConfiguration();
  }

  if (normalized !== url.origin && normalized !== `${url.origin}/`) {
    invalidConfiguration();
  }

  return url.origin;
}

function parseAllowlist(value: string | undefined, required: boolean) {
  if (value === undefined || value.trim() === "") {
    if (required) {
      invalidConfiguration();
    }

    return new Set<string>();
  }

  let candidate: unknown;

  try {
    candidate = JSON.parse(value);
  } catch {
    invalidConfiguration();
  }

  if (!Array.isArray(candidate) || (required && candidate.length === 0)) {
    invalidConfiguration();
  }

  const values = new Set<string>();

  for (const item of candidate) {
    if (typeof item !== "string") {
      invalidConfiguration();
    }

    const normalized = item.trim();

    if (!normalized || normalized !== item || values.has(normalized)) {
      invalidConfiguration();
    }

    values.add(normalized);
  }

  return values;
}

export function loadTransactionalEmailWorkerSecret(
  environment: TransactionalEmailEnvironment = process.env
) {
  return requireNonblank(environment.TRANSACTIONAL_EMAIL_WORKER_SECRET);
}

export function loadTransactionalEmailConfig(
  environment: TransactionalEmailEnvironment = process.env
): TransactionalEmailConfig {
  const mode = parseMode(environment.TRANSACTIONAL_EMAIL_MODE);
  const workerSecret = loadTransactionalEmailWorkerSecret(environment);
  const allowedClerkUserIds = parseAllowlist(
    environment.TRANSACTIONAL_EMAIL_ALLOWED_CLERK_USER_IDS,
    mode === "allowlist"
  );

  if (mode === "disabled") {
    return {
      mode,
      resendApiKey: null,
      from: null,
      replyTo: null,
      appOrigin: null,
      allowedClerkUserIds,
      workerSecret,
    };
  }

  return {
    mode,
    resendApiKey: requireNonblank(environment.RESEND_API_KEY),
    from: requireNonblank(environment.TRANSACTIONAL_EMAIL_FROM),
    replyTo: requireNonblank(environment.TRANSACTIONAL_EMAIL_REPLY_TO),
    appOrigin: parseAppOrigin(environment.TRANSACTIONAL_EMAIL_APP_ORIGIN),
    allowedClerkUserIds,
    workerSecret,
  };
}
