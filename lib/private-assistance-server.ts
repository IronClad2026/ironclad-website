import "server-only";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isAccountLegalAcceptanceRpcError } from "@/lib/account-legal-rpc-error";
import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { AssistanceErrorCode, AssistanceResult } from "@/lib/private-assistance";

type AssistanceActor = { clerkUserId: string; isAdmin: boolean };
type AssistanceOperation =
  | "get_private_assistance_context"
  | "open_private_assistance"
  | "read_private_assistance"
  | "reply_private_assistance"
  | "list_admin_private_assistance"
  | "set_private_assistance_status"
  | "list_legacy_room_assistance"
  | "get_match_room_assistance"
  | "resolve_match_room_assistance";

type AssistanceAuthorization =
  | { ok: true; data: AssistanceActor }
  | { ok: false; code: "auth_required" | "forbidden" | "legal_required" };

export async function authorizePrivateAssistance(admin = false, mutation = false): Promise<AssistanceAuthorization> {
  try {
    const { userId, sessionClaims, sessionId } = await auth();
    if (!userId || !sessionId) return { ok: false, code: "auth_required" };
    const isAdmin = await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, true);
    if (admin && !isAdmin) {
      return { ok: false, code: "forbidden" };
    }
    if (mutation) {
      try { await requireCurrentAccountLegalAcceptance(); }
      catch { return { ok: false, code: "legal_required" }; }
    }
    return { ok: true, data: { clerkUserId: userId, isAdmin } };
  } catch {
    return { ok: false, code: "auth_required" };
  }
}

export async function callPrivateAssistance<T>(
  actor: AssistanceActor,
  operation: AssistanceOperation,
  args: Record<string, string | number | boolean | null>,
  parse: (value: unknown) => T | null
): Promise<AssistanceResult<T>> {
  try {
    const { data, error } = await callPrivateAssistanceRpc(actor, operation, args);
    if (error) return { ok: false, code: privateAssistanceError(error) };
    const parsed = parse(data);
    return parsed ? { ok: true, data: parsed } : { ok: false, code: "unavailable" };
  } catch { return { ok: false, code: "unavailable" }; }
}

export async function callPrivateAssistanceRpc(
  actor: AssistanceActor,
  operation: AssistanceOperation,
  args: Record<string, string | number | boolean | null>,
) {
  return createSupabaseAdminClient().rpc("call_patch2_private_assistance", {
    p_operation: operation,
    p_arguments: args,
    p_actor_clerk_user_id: actor.clerkUserId,
    p_actor_is_admin: actor.isAdmin,
  });
}

function privateAssistanceError(error: { code?: string; message?: string }): AssistanceErrorCode {
  if (isAccountLegalAcceptanceRpcError(error)) {
    return error.message === "ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED" ? "legal_required" : "unavailable";
  }
  if (error.code === "42501") return "forbidden";
  if (error.code === "22023" || error.code === "22P02") return "invalid_request";
  if (error.code === "23505" || error.code === "40001") return "conflict";
  if (error.code === "P0001" && error.message === "ASSISTANCE_DISABLED") return "disabled";
  if (error.code === "P0001" && error.message === "ASSISTANCE_RATE_LIMITED") return "rate_limited";
  return "unavailable";
}
