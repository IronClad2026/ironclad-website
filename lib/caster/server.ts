import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { getCasterInvitationOrigin } from "@/lib/caster/environment";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isCasterRequestAtOrigin } from "@/lib/caster/request-origin";

export const CASTER_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
export const CASTER_PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export function isCasterPostOrigin(request: Request) {
  const origin = getCasterInvitationOrigin();
  return Boolean(origin && !request.headers.has("next-action") && request.headers.get("origin") === origin &&
    isCasterRequestAtOrigin(request, origin));
}

export async function readSmallCasterBody(request: Request, maxBytes: number) {
  if (!request.body || Number(request.headers.get("content-length")) > maxBytes) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(maxBytes);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
      if (size + value.byteLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, size);
      size += value.byteLength;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function casterRpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args).abortSignal(AbortSignal.timeout(5000));
    return error ? null : data as T;
  } catch {
    return null;
  }
}

type CurrentCasterAccount =
  | { status: "open"; id: string; email: string | null; emailVerified: boolean }
  | { status: "signed_out" | "closed" | "unavailable" };

export async function loadCurrentCasterAccount(): Promise<CurrentCasterAccount> {
  try {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) return { status: "signed_out" };

    await requireCurrentAccountLegalAcceptance();
    const clerk = await clerkClient();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const results = await Promise.race([
        Promise.all([
          clerk.users.getUser(userId),
          clerk.sessions.getSession(sessionId),
          casterRpc<boolean>("caster_phase1_account_open", { p_actor: userId }),
        ]),
        new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), 5000); }),
      ]);
      if (!results) return { status: "unavailable" };
      const [user, session, accountOpen] = results;
      if (accountOpen === null) return { status: "unavailable" };
      if (!accountOpen || user.id !== userId || user.banned || user.locked || session.id !== sessionId ||
        session.userId !== userId || session.status !== "active" || !Number.isFinite(session.expireAt) ||
        session.expireAt <= Date.now()) return { status: "closed" };

      const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
      return { status: "open", id: userId, email: email?.emailAddress ?? null, emailVerified: email?.verification?.status === "verified" };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch {
    return { status: "unavailable" };
  }
}
