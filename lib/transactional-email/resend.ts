import "server-only";

import { createHash } from "node:crypto";
import { Resend } from "resend";

import type { TransactionalEmailTemplateKey } from "@/lib/transactional-email/templates";

const MAX_PROVIDER_MESSAGE_ID_LENGTH = 255;

export type TransactionalEmailIdempotencyInput = {
  notificationId: string;
  recipientClerkUserId: string;
  eventKey: string;
  templateKey: TransactionalEmailTemplateKey;
};

export type SendTransactionalEmailInput = {
  apiKey: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo: string;
  idempotencyKey: string;
};

export type SendTransactionalEmailResult =
  | {
      status: "accepted";
      providerMessageId: string;
    }
  | {
      status: "retryable_failure" | "permanent_failure";
      errorCode: string;
    };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function readString(value: unknown, key: string) {
  const record = asRecord(value);
  const candidate = record?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function readStatusCode(value: unknown) {
  const record = asRecord(value);
  const candidate = record?.statusCode;
  return typeof candidate === "number" && Number.isInteger(candidate)
    ? candidate
    : null;
}

function isAcceptedProviderMessageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PROVIDER_MESSAGE_ID_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function classifyProviderError(error: unknown): SendTransactionalEmailResult {
  const name = readString(error, "name")?.toLowerCase();
  const statusCode = readStatusCode(error);

  if (name === "concurrent_idempotent_requests") {
    return {
      status: "retryable_failure",
      errorCode: "RESEND_IDEMPOTENCY_IN_PROGRESS",
    };
  }

  if (name === "invalid_idempotent_request") {
    return {
      status: "permanent_failure",
      errorCode: "RESEND_IDEMPOTENCY_MISMATCH",
    };
  }

  if (
    name === "rate_limit_exceeded" ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429
  ) {
    return {
      status: "retryable_failure",
      errorCode: "RESEND_RATE_LIMITED",
    };
  }

  if (
    name === "application_error" ||
    name === "internal_server_error" ||
    (statusCode !== null && statusCode >= 500)
  ) {
    return {
      status: "retryable_failure",
      errorCode: "RESEND_SERVER_ERROR",
    };
  }

  return {
    status: "permanent_failure",
    errorCode: "RESEND_REQUEST_REJECTED",
  };
}

function classifyThrownError(error: unknown): SendTransactionalEmailResult {
  const name = readString(error, "name")?.toUpperCase();
  const code = readString(error, "code")?.toUpperCase();
  const timeoutCodes = new Set([
    "ABORT_ERR",
    "ETIMEDOUT",
    "ESOCKETTIMEDOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
  ]);

  if (
    name === "ABORTERROR" ||
    name === "TIMEOUTERROR" ||
    (code !== null && code !== undefined && timeoutCodes.has(code))
  ) {
    return {
      status: "retryable_failure",
      errorCode: "RESEND_NETWORK_TIMEOUT",
    };
  }

  return {
    status: "retryable_failure",
    errorCode: "RESEND_NETWORK_ERROR",
  };
}

export function createTransactionalEmailIdempotencyKey(
  input: TransactionalEmailIdempotencyInput
) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        input.notificationId,
        input.recipientClerkUserId,
        input.eventKey,
        input.templateKey,
      ]),
      "utf8"
    )
    .digest("base64url");

  return `ic_txn_v1_${digest}`;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  try {
    const resend = new Resend(input.apiKey);
    const response = await resend.emails.send(
      {
        from: input.from,
        to: input.recipient,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
      {
        idempotencyKey: input.idempotencyKey,
      }
    );

    if (response.error) {
      return classifyProviderError(response.error);
    }

    if (!isAcceptedProviderMessageId(response.data?.id)) {
      return {
        status: "retryable_failure",
        errorCode: "RESEND_RESPONSE_INVALID",
      };
    }

    return {
      status: "accepted",
      providerMessageId: response.data.id,
    };
  } catch (error) {
    return classifyThrownError(error);
  }
}
