import "server-only";

import {
  serializeSupabaseError,
  type SerializedSupabaseError,
} from "@/lib/supabase-errors";
import type {
  WarfrontCommandError,
  WarfrontCommandErrorCode,
} from "@/lib/warfront/contracts";

const SAFE_MESSAGES: Record<WarfrontCommandErrorCode, string> = {
  VALIDATION_ERROR: "The submitted Company details are invalid.",
  UNAUTHENTICATED: "Sign in is required to create a Company.",
  LEGAL_REQUIRED: "Accept the current legal documents before continuing.",
  LEGAL_UNAVAILABLE:
    "Legal acceptance could not be verified. Please try again.",
  FORBIDDEN: "You are not allowed to perform this action.",
  NOT_FOUND: "The required account record was not found.",
  NOT_AVAILABLE: "This action is not available.",
  LIFECYCLE_CONFLICT: "This action is not available in the current state.",
  CONCURRENCY_CONFLICT:
    "The request conflicted with another update. Please try again.",
  INTERNAL_ERROR: "The command could not be completed. Please try again.",
};

export function createWarfrontCommandError(
  code: WarfrontCommandErrorCode,
  options?: { retryable?: boolean }
): WarfrontCommandError {
  return {
    code,
    message: SAFE_MESSAGES[code],
    retryable: options?.retryable ?? code === "CONCURRENCY_CONFLICT",
  };
}

export function normalizeWarfrontCommandError(
  error: unknown
): WarfrontCommandError {
  const serialized = safelySerializeSupabaseError(error);
  const code = serialized.code;

  if (code === "22023") {
    return createWarfrontCommandError("VALIDATION_ERROR");
  }

  if (code === "42501") {
    return createWarfrontCommandError("FORBIDDEN");
  }

  if (code === "P0002") {
    return createWarfrontCommandError("NOT_FOUND");
  }

  if (code === "55000") {
    return createWarfrontCommandError("LIFECYCLE_CONFLICT");
  }

  if (
    code === "4001" ||
    code === "40001" ||
    code === "40P01" ||
    code === "PT409" ||
    serialized.status === 409 ||
    serialized.status === "409"
  ) {
    return createWarfrontCommandError("CONCURRENCY_CONFLICT");
  }

  if (isRetryableTransportFailure(serialized)) {
    return createWarfrontCommandError("INTERNAL_ERROR", { retryable: true });
  }

  return createWarfrontCommandError("INTERNAL_ERROR");
}

function safelySerializeSupabaseError(
  error: unknown
): Pick<SerializedSupabaseError, "code" | "status"> {
  try {
    const serialized = serializeSupabaseError(error);
    return {
      code: serialized.code,
      status: serialized.status,
    };
  } catch {
    return { code: null, status: null };
  }
}

function isRetryableTransportFailure(
  error: Pick<SerializedSupabaseError, "code" | "status">
) {
  return (
    error.status === 408 ||
    error.status === 429 ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504 ||
    error.status === "408" ||
    error.status === "429" ||
    error.status === "502" ||
    error.status === "503" ||
    error.status === "504" ||
    error.code === "57014" ||
    error.code === "53300" ||
    error.code === "08006"
  );
}
