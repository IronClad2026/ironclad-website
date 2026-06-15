type SupabaseErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export type SerializedSupabaseError = {
  name: string | null;
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  status: number | string | null;
};

export function serializeSupabaseError(
  error: unknown
): SerializedSupabaseError {
  const value =
    error && typeof error === "object"
      ? (error as SupabaseErrorLike)
      : undefined;

  return {
    name: toNullableString(value?.name),
    message:
      toNullableString(value?.message) ??
      (typeof error === "string" ? error : "Unknown Supabase error"),
    code: toNullableString(value?.code),
    details: toNullableString(value?.details),
    hint: toNullableString(value?.hint),
    status:
      toNullableStatus(value?.status) ?? toNullableStatus(value?.statusCode),
  };
}

export function logSupabaseError(context: string, error: unknown) {
  console.error(context, serializeSupabaseError(error));
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableStatus(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? value : null;
}
