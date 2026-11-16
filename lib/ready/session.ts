import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
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
    const supabase = await createAuthenticatedSupabaseClient();
    const profile = await supabase.from("players").select("account_closed_at")
      .eq("clerk_user_id", userId).maybeSingle();
    return !profile.error && profile.data?.account_closed_at === null ? { userId, sessionId } : null;
  } catch {
    return null;
  }
}
