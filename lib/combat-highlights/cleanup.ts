import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isShowcaseUuid } from "@/lib/player-showcase/validation";
import { mediaConfiguration } from "./config";
import { signMediaGrant } from "./signing";

// Durable SQL claims survive provider failure. This bounded maintenance pass is
// invoked after media changes and by the explicit admin retry action.
export async function drainHighlightCleanup(limit = 3): Promise<number> {
  const config = mediaConfiguration();
  if (!config) return 0;
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc("claim_player_combat_highlight_cleanup", { p_limit: Math.min(10, Math.max(1, limit)) });
  if (error || !Array.isArray(data)) return 0;
  let deleted = 0;
  for (const row of data.slice(0, 10)) {
    if (!isShowcaseUuid(row.uploadId) || !isShowcaseUuid(row.claimToken)) continue;
    let success = false;
    try {
      const grant = await signMediaGrant({ op: "delete", id: row.uploadId, kind: "video", size: 0, type: "", origin: "", exp: Math.floor(Date.now() / 1000) + 60 });
      const response = await fetch(config.origin + "/internal/" + row.uploadId + "/video", { method: "DELETE", headers: { Authorization: "Bearer " + grant }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
      success = response.status === 204;
      await response.body?.cancel();
    } catch { /* SQL retains the claim for a bounded retry. */ }
    const finished = await client.rpc("finish_player_combat_highlight_cleanup", { p_upload_id: row.uploadId, p_claim_token: row.claimToken, p_deleted: success, p_error_code: success ? null : "provider-unavailable" });
    if (success && !finished.error) deleted++;
  }
  return deleted;
}
