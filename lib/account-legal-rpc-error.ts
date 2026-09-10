import "server-only";

/** Recognize only the fixed legal-acceptance contract, not other permission failures. */
export function isAccountLegalAcceptanceRpcError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || Array.isArray(error)) return false;
  const candidate = error as Record<string, unknown>;
  try {
    return candidate.code === "42501" &&
      (candidate.message === "ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED" ||
        candidate.message === "ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE");
  } catch {
    return false;
  }
}
