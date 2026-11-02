import "server-only";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import type { AssistanceErrorCode, AssistanceResult } from "@/lib/private-assistance";

export async function authorizePrivateAssistance(admin = false, mutation = false): Promise<AssistanceErrorCode | null> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) return "auth_required";
    if (admin && (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role !== "admin") return "forbidden";
    if (mutation) {
      try { await requireCurrentAccountLegalAcceptance(); }
      catch { return "legal_required"; }
    }
    return null;
  } catch { return "auth_required"; }
}

export async function callPrivateAssistance<T>(
  name: string,
  args: Record<string, string | number | boolean | null>,
  parse: (value: unknown) => T | null
): Promise<AssistanceResult<T>> {
  try {
    const client = await createAuthenticatedSupabaseClient();
    const { data, error } = await client.rpc(name, args);
    if (error) return { ok: false, code: privateAssistanceError(error) };
    const parsed = parse(data);
    return parsed ? { ok: true, data: parsed } : { ok: false, code: "unavailable" };
  } catch { return { ok: false, code: "unavailable" }; }
}

function privateAssistanceError(error: { code?: string; message?: string }): AssistanceErrorCode {
  if (error.code === "42501") return "forbidden";
  if (error.code === "22023" || error.code === "22P02") return "invalid_request";
  if (error.code === "23505" || error.code === "40001") return "conflict";
  if (error.code === "P0001" && error.message === "ASSISTANCE_DISABLED") return "disabled";
  if (error.code === "P0001" && error.message === "ASSISTANCE_RATE_LIMITED") return "rate_limited";
  return "unavailable";
}
