import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { loadReadyActiveProfile } from "./platform-data";
import { isReadyEngagementEnabled, isReadyProductionEnabled, isReadyReviewUser, readyReviewAliases } from "./review-access";
import type { ReadyIdentity } from "./usage";

type ReadyAccess =
  | { kind: "guest" }
  | { kind: "restricted" }
  | { kind: "signed-in"; identity: ReadyIdentity };

export async function loadReadyAccess(): Promise<ReadyAccess> {
  const { userId, sessionId } = await auth();
  if (!userId && !sessionId) return { kind: "guest" };
  if (!userId || !sessionId) return { kind: "restricted" };
  const user = await (await clerkClient()).users.getUser(userId);
  if (user.id !== userId || user.banned || user.locked) return { kind: "restricted" };
  return { kind: "signed-in", identity: { userId, sessionId } };
}

export async function loadReadyUsageReviewer() {
  const production = isReadyProductionEnabled() && isReadyEngagementEnabled();
  const aliases = readyReviewAliases(process.env);
  if (!production && aliases.length === 0) return null;
  try {
    const { userId, sessionId, sessionClaims } = await auth();
    if (!userId || !sessionId) return null;
    if (production) {
      if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, false, { refreshClerkAuthority: true })) return null;
    } else {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      if (!isReadyReviewUser(user, userId, aliases)) return null;
    }
    return await loadReadyActiveProfile(userId) ? { userId, sessionId } : null;
  } catch {
    return null;
  }
}
