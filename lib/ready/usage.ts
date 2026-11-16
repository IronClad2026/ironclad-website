import "server-only";

import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ReadyIdentity = { userId: string; sessionId: string };

export function createReadyRateGuard(now = Date.now) {
  let activeMinute = -1;
  const users = new Map<string, number>();
  const sessions = new Map<string, number>();
  return function allow({ userId, sessionId }: ReadyIdentity): boolean {
    const minute = Math.floor(now() / 60_000);
    if (activeMinute !== minute) {
      users.clear();
      sessions.clear();
      activeMinute = minute;
    }
    const byUser = users.get(userId) ?? 0;
    const bySession = sessions.get(sessionId) ?? 0;
    if (byUser >= 16 || bySession >= 10) return false;
    users.set(userId, byUser + 1);
    sessions.set(sessionId, bySession + 1);
    return true;
  };
}

export const allowReadyRequest = createReadyRateGuard();
type BudgetConfig = { key: string; day: string; cap: number };

export function getReadyBudgetConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): BudgetConfig | null {
  const { READY_USAGE_HMAC_KEY, READY_CF_TRIAL_UTC_DAY, READY_CF_TRIAL_NEURONS } = environment;
  if (environment.VERCEL_ENV !== "preview" || environment.VERCEL_GIT_COMMIT_REF !== "staging" ||
    environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== "https://zzbnneprhjicmajpjkdg.supabase.co") return null;
  if (!READY_USAGE_HMAC_KEY || READY_USAGE_HMAC_KEY.length < 32 || !READY_CF_TRIAL_UTC_DAY ||
    READY_CF_TRIAL_UTC_DAY !== now.toISOString().slice(0, 10) || !/^\d+$/.test(READY_CF_TRIAL_NEURONS ?? "")) return null;
  const cap = Number(READY_CF_TRIAL_NEURONS);
  return cap >= 1 && cap <= 2_000 ? { key: READY_USAGE_HMAC_KEY, day: READY_CF_TRIAL_UTC_DAY, cap } : null;
}

export async function reserveReadyInference(
  config: BudgetConfig,
  identity: ReadyIdentity,
  account: string,
  neurons: number,
  signal: AbortSignal,
): Promise<"reserved" | "quota" | "unavailable"> {
  const digest = (id: string) => createHmac("sha256", config.key).update(id).digest("hex");
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("reserve_ready_ai_usage", {
      p_account: account,
      p_user_hash: digest(`user:${identity.userId}`),
      p_session_hash: digest(`session:${identity.sessionId}`),
      p_day: config.day,
      p_neurons: neurons,
      p_neuron_cap: config.cap,
    }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(1_200)]));
    return !error && (data === "reserved" || data === "quota") ? data : "unavailable";
  } catch {
    return "unavailable";
  }
}
