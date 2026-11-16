import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { loadReadyActiveProfile } from "./platform-data";
import { isReadyReviewUser, readyReviewAliases } from "./review-access";

export async function loadReadySession() {
  const aliases = readyReviewAliases(process.env);
  if (aliases.length === 0) return null;
  try {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) return null;
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (!isReadyReviewUser(user, userId, aliases)) return null;
    return await loadReadyActiveProfile(userId) ? { userId, sessionId } : null;
  } catch {
    return null;
  }
}
