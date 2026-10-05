export type WarfrontCommandErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "LEGAL_REQUIRED"
  | "LEGAL_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_AVAILABLE"
  | "LIFECYCLE_CONFLICT"
  | "CONCURRENCY_CONFLICT"
  | "INTERNAL_ERROR";

export type WarfrontCommandError = {
  code: WarfrontCommandErrorCode;
  message: string;
  retryable: boolean;
};

export type CommandResult<T> =
  | {
      ok: true;
      data: T;
      correlationId: string;
    }
  | {
      ok: false;
      error: WarfrontCommandError;
      correlationId: string;
    };

export type CreateWarfrontCompanyInput = {
  name: string;
  tag: string;
  slug: string;
  description?: string | null;
  region?: string | null;
};

export type CreateWarfrontCompanyOutput = {
  companyId: string;
  role: "commander";
  createdAt: string;
  duplicate: boolean;
};
