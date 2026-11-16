import "server-only";

import { createHmac } from "node:crypto";

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
const dailyNeuronLimit = 2_000;
const dailyAccountRequests = 100;
const dailyUserRequests = 16;
const dailySessionRequests = 10;
const reservationExpiry = 172_800;

// Reject before creating any counters. Redis executes these reads and reservations atomically.
const reserveScript = `
for i = 1, 4 do
  if tonumber(redis.call('GET', KEYS[i]) or '0') + tonumber(ARGV[i]) > tonumber(ARGV[i + 4]) then
    return 0
  end
end
for i = 1, 4 do
  redis.call('INCRBY', KEYS[i], ARGV[i])
  redis.call('EXPIRE', KEYS[i], ARGV[9])
end
return 1
`;

type BudgetConfig = { url: string; token: string; key: string };

export function getReadyBudgetConfig(): BudgetConfig | null {
  const { READY_REDIS_REST_URL, READY_REDIS_REST_TOKEN, READY_USAGE_HMAC_KEY } = process.env;
  if (!READY_REDIS_REST_URL || !READY_REDIS_REST_TOKEN || !READY_USAGE_HMAC_KEY || READY_USAGE_HMAC_KEY.length < 32) return null;
  try {
    const url = new URL(READY_REDIS_REST_URL);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") ||
      url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { url: url.origin, token: READY_REDIS_REST_TOKEN, key: READY_USAGE_HMAC_KEY };
  } catch {
    return null;
  }
}

export async function reserveReadyInference(
  config: BudgetConfig,
  identity: ReadyIdentity,
  account: string,
  neurons: number,
  signal: AbortSignal,
): Promise<"reserved" | "quota" | "unavailable"> {
  const utcDay = new Date().toISOString().slice(0, 10);
  const digest = (id: string) => createHmac("sha256", config.key).update(id).digest("hex");
  const prefix = `ironclad:ready:staging:${account}:${utcDay}`;
  const keys = [`${prefix}:neurons`, `${prefix}:requests`,
    `${prefix}:user:${digest(identity.userId)}`, `${prefix}:session:${digest(identity.sessionId)}`];
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(["EVAL", reserveScript, keys.length, ...keys, neurons, 1, 1, 1,
        dailyNeuronLimit, dailyAccountRequests, dailyUserRequests, dailySessionRequests, reservationExpiry]),
      signal: AbortSignal.any([signal, AbortSignal.timeout(900)]),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return "unavailable";
    const { result } = await response.json() as { result?: unknown };
    if (result === 1) return "reserved";
    return result === 0 ? "quota" : "unavailable";
  } catch {
    return "unavailable";
  }
}
