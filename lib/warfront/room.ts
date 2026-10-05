import "server-only";

import { auth } from "@clerk/nextjs/server";
import {
  isWarfrontOperationRoomId,
  parseWarfrontOperationRoomBootstrap,
  type WarfrontOperationRoomBootstrap,
} from "@/lib/warfront/contracts";
import { serializeSupabaseError } from "@/lib/supabase-errors";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type WarfrontOperationRoomBootstrapFailureCode =
  | "unauthenticated"
  | "invalid_operation_id"
  | "inaccessible"
  | "malformed_response"
  | "unavailable";

export type WarfrontOperationRoomBootstrapResult =
  | { ok: true; data: WarfrontOperationRoomBootstrap }
  | { ok: false; code: WarfrontOperationRoomBootstrapFailureCode };

/**
 * Trusted read boundary for the participant-scoped WARFRONT Room bootstrap.
 * The Clerk actor is intentionally derived here and never accepted from callers.
 */
export async function getWarfrontOperationRoomBootstrap(
  operationId: string
): Promise<WarfrontOperationRoomBootstrapResult> {
  let userId: string | null;
  try {
    ({ userId } = await auth());
  } catch {
    return { ok: false, code: "unauthenticated" };
  }

  if (!userId) {
    return { ok: false, code: "unauthenticated" };
  }

  if (!isWarfrontOperationRoomId(operationId)) {
    return { ok: false, code: "invalid_operation_id" };
  }

  try {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "get_warfront_operation_room_bootstrap_api",
      {
        p_operation_id: operationId,
        p_actor_clerk_user_id: userId,
      }
    );

    if (error) {
      return {
        ok: false,
        code: isInaccessibleRoomError(error) ? "inaccessible" : "unavailable",
      };
    }

    const bootstrap = parseWarfrontOperationRoomBootstrap(data);
    return bootstrap
      ? { ok: true, data: bootstrap }
      : { ok: false, code: "malformed_response" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

function isInaccessibleRoomError(error: unknown): boolean {
  const { code } = serializeSupabaseError(error);
  return code === "42501" || code === "P0002" || code === "55000";
}
