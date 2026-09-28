import { describe, expect, it } from "vitest";
import { assertRealtimeStagingEnvironment } from "@/lib/p03-1-preview-safety";

const staging = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "codex/p03-1-realtime-match-room",
  NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  CLERK_SECRET_KEY: "sk_test_fixture",
};
describe("P03.1 deployment isolation", () => {
  it("accepts staging preview and canonical staging without changing other builds", () => {
    expect(() => assertRealtimeStagingEnvironment(staging)).not.toThrow();
    expect(() => assertRealtimeStagingEnvironment({ ...staging, VERCEL_GIT_COMMIT_REF: "staging" })).not.toThrow();
    expect(() => assertRealtimeStagingEnvironment({ VERCEL_ENV: "production" })).not.toThrow();
    expect(() => assertRealtimeStagingEnvironment({})).not.toThrow();
  });
  it("rejects production database, Clerk live keys and mismatched JWT keys without echoing values", () => {
    for (const overrides of [
      { NEXT_PUBLIC_SUPABASE_URL: "https://nsyjtqpvyxlzyujlbzos.supabase.co" },
      { CLERK_SECRET_KEY: "sk_live_do_not_echo" },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture" },
      { SUPABASE_SERVICE_ROLE_KEY: `header.${Buffer.from(JSON.stringify({ ref: "other" })).toString("base64url")}.secret` },
    ]) {
      expect(() => assertRealtimeStagingEnvironment({ ...staging, ...overrides })).toThrow("P03.1 Staging isolation failed");
    }
    expect(() => assertRealtimeStagingEnvironment({ ...staging, CLERK_SECRET_KEY: "sk_live_do_not_echo" })).not.toThrow("sk_live_do_not_echo");
  });
});
