import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type AdminAccount = "active-player" | "no-player" | "denied";
const LOOKUP_TIMEOUT_MS = 4_000;

// React's request cache deduplicates repeated checks within a server render.
// Each new request still reads the current Clerk role and session status.
const readAdminAccount = cache(async (userId: string, sessionId: string): Promise<AdminAccount> => {
  try {
    const clerk = await clerkClient();
    const authority = await readClerkAuthority(clerk, userId, sessionId);
    if (!authority) return "denied";
    const [user, session] = authority;
    if (user.id !== userId || user.publicMetadata.role !== "admin" || user.banned || user.locked ||
      session.id !== sessionId || session.userId !== userId || session.status !== "active" ||
      !Number.isFinite(session.expireAt) || session.expireAt <= Date.now()) return "denied";

    // This service-role lookup reads only the verified caller's closure status.
    const player = await createSupabaseAdminClient().from("players")
      .select("account_closed_at")
      .eq("clerk_user_id", userId)
      .abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))
      .maybeSingle();
    if (player.error) return "denied";
    if (player.data === null) return "no-player";
    return player.data.account_closed_at === null ? "active-player" : "denied";
  } catch {
    return "denied";
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
  const account = await readAdminAccount(userId, sessionId);
  return account === "active-player" || (!requirePlayer && account === "no-player");
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
