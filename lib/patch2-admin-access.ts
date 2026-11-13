import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKUP_TIMEOUT_MS = 4_000;

// Deduplicate Clerk lookups within a render. Closure state stays uncached.
const hasCurrentClerkAdminAuthority = cache(async (userId: string, sessionId: string): Promise<boolean> => {
  try {
    const clerk = await clerkClient();
    const authority = await readClerkAuthority(clerk, userId, sessionId);
    if (!authority) return false;
    const [user, session] = authority;
    if (user.id !== userId || user.publicMetadata.role !== "admin" || user.banned || user.locked ||
      session.id !== sessionId || session.userId !== userId || session.status !== "active" ||
      !Number.isFinite(session.expireAt) || session.expireAt <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
});

async function readClerkAuthority(
  clerk: Awaited<ReturnType<typeof clerkClient>>,
  userId: string,
  sessionId: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all([clerk.users.getUser(userId), clerk.sessions.getSession(sessionId)]),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function hasCurrentPatch2AdminAccess(
  userId: string | null,
  sessionClaims: unknown,
  sessionId: string | null,
  requirePlayer = false,
): Promise<boolean> {
  const role = (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role;
  if (!userId || !sessionId || role !== "admin") return false;
  if (!await hasCurrentClerkAdminAuthority(userId, sessionId)) return false;
  try {
    const account = await createSupabaseAdminClient().rpc("get_patch2_admin_account_state", {
      p_clerk_user_id: userId,
    }).abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS));
    return !account.error && (account.data === "active-player" || (!requirePlayer && account.data === "no-player"));
  } catch {
    return false;
  }
}

export async function requireCurrentPatch2Admin(): Promise<string> {
  try {
    const { userId, sessionClaims, sessionId } = await auth();
    if (userId && await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId)) return userId;
  } catch {
    // Keep provider details out of Server Action errors.
  }
  throw new Error("Unauthorized");
}
