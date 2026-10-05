import "server-only";

import { auth } from "@clerk/nextjs/server";
import {
  AccountLegalMutationBlockedError,
  requireCurrentAccountLegalAcceptance,
} from "@/lib/account-legal-mutation-guard";
import type { WarfrontCommandError } from "@/lib/warfront/contracts";
import { createWarfrontCommandError } from "@/lib/warfront/commands/errors";

export type WarfrontActorContext = {
  clerkUserId: string;
};

export type WarfrontActorContextResult =
  | { ok: true; context: WarfrontActorContext }
  | { ok: false; error: WarfrontCommandError };

export async function createWarfrontActorContext(): Promise<WarfrontActorContextResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { ok: false, error: createWarfrontCommandError("UNAUTHENTICATED") };
    }

    return { ok: true, context: { clerkUserId: userId } };
  } catch {
    return { ok: false, error: createWarfrontCommandError("UNAUTHENTICATED") };
  }
}

export async function requireWarfrontLegalAcceptance(): Promise<
  WarfrontCommandError | null
> {
  try {
    await requireCurrentAccountLegalAcceptance();
    return null;
  } catch (error) {
    if (
      error instanceof AccountLegalMutationBlockedError &&
      error.reason === "required"
    ) {
      return createWarfrontCommandError("LEGAL_REQUIRED");
    }

    return createWarfrontCommandError("LEGAL_UNAVAILABLE");
  }
}
