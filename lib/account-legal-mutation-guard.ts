import "server-only";

import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";

export type AccountLegalMutationBlockReason = "required" | "unavailable";

export class AccountLegalMutationBlockedError extends Error {
  readonly reason: AccountLegalMutationBlockReason;

  constructor(reason: AccountLegalMutationBlockReason) {
    super(
      reason === "required"
        ? "Current account legal acceptance is required before continuing."
        : "Current account legal acceptance could not be verified."
    );
    this.name = "AccountLegalMutationBlockedError";
    this.reason = reason;
  }
}

export async function requireCurrentAccountLegalAcceptance(): Promise<void> {
  let state: Awaited<ReturnType<typeof loadAccountLegalGateState>>;

  try {
    state = await loadAccountLegalGateState();
  } catch {
    throw new AccountLegalMutationBlockedError("unavailable");
  }

  if (state.status === "satisfied") return;

  throw new AccountLegalMutationBlockedError(
    state.status === "required" ? "required" : "unavailable"
  );
}
