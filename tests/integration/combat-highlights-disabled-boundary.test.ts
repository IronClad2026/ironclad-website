import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), publicClient: vi.fn(), ownerClient: vi.fn(), adminClient: vi.fn(), legal: vi.fn(), fetch: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://www.ironcladtournaments.com" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createNoStoreSupabaseClient: mocks.publicClient }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.ownerClient }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.adminClient }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal, AccountLegalMutationBlockedError: class extends Error {} }));

import { getMyCombatHighlights, getPublicCombatHighlights } from "@/lib/combat-highlights/read";
import { cancelCombatHighlight, clearCombatHighlight, completeCombatHighlight, previewCombatHighlight, reorderCombatHighlights, reportCombatHighlight, reserveCombatHighlight } from "@/lib/combat-highlights/mutations";
import { getHighlightsForModeration, moderateCombatHighlight, retryHighlightCleanup } from "@/lib/combat-highlights/moderation";
import { drainHighlightCleanup } from "@/lib/combat-highlights/cleanup";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://nsyjtqpvyxlzyujlbzos.supabase.co");
  vi.stubEnv("COMBAT_HIGHLIGHTS_ENABLED", "true");
  vi.stubEnv("COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV", "production");
  vi.stubEnv("COMBAT_HIGHLIGHTS_WORKER_URL", "");
  vi.stubEnv("COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK", "");
  mocks.auth.mockResolvedValue({ userId: "synthetic-admin", sessionClaims: { metadata: { role: "admin" } }, getToken: async () => "synthetic-token" });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Unprovisioned Production Highlights cannot touch any provider", () => {
  it("keeps public and private reads empty and maintenance idle despite an accidental enable flag", async () => {
    expect(await getPublicCombatHighlights(id)).toEqual([]);
    expect(await getMyCombatHighlights()).toBeNull();
    expect(await getHighlightsForModeration(id)).toEqual([]);
    expect(await drainHighlightCleanup()).toBe(0);
    expect(mocks.publicClient).not.toHaveBeenCalled();
    expect(mocks.ownerClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects every externally callable media mutation before legal, RPC, signing or network work", async () => {
    const results = await Promise.all([
      reserveCombatHighlight({ slotNumber: 1, expectedRevision: 0, title: "Synthetic", fileName: "clip.mp4", contentType: "video/mp4", byteLength: 4, posterByteLength: 0, declarationAccepted: true, declarationVersion: 1 }),
      completeCombatHighlight(id), cancelCombatHighlight(id, 0), clearCombatHighlight(1, 0),
      reorderCombatHighlights([1], [0]), previewCombatHighlight(id), reportCombatHighlight(id, "privacy"),
      moderateCombatHighlight({ playerId: id, slotNumber: 1, revision: 0, hidden: true }), retryHighlightCleanup(),
    ]);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(mocks.legal).not.toHaveBeenCalled();
    expect(mocks.ownerClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
