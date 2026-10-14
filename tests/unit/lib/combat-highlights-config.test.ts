import { describe, expect, it } from "vitest";
import { mediaConfiguration } from "@/lib/combat-highlights/config";

const key = JSON.stringify({ kty: "EC", crv: "P-256", x: "A".repeat(43), y: "B".repeat(43), d: "C".repeat(43) });
const production = {
  VERCEL_ENV: "production",
  COMBAT_HIGHLIGHTS_ENABLED: "true",
  COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://nsyjtqpvyxlzyujlbzos.supabase.co",
  COMBAT_HIGHLIGHTS_WORKER_URL: "https://ironclad-production-combat-highlights.synthetic-account.workers.dev",
  COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS: "https://www.ironcladtournaments.com,https://ironcladtournaments.com",
  COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK: key,
};

describe("Highlights explicit resource contract (synthetic configuration only)", () => {
  it("defaults OFF without touching resources", () => {
    expect(mediaConfiguration({})).toBeNull();
    expect(mediaConfiguration({ ...production, COMBAT_HIGHLIGHTS_ENABLED: "false" })).toBeNull();
  });
  it("accepts a complete Production contract without proving provider provisioning", () => {
    expect(mediaConfiguration(production)).toEqual({
      origin: production.COMBAT_HIGHLIGHTS_WORKER_URL,
      allowedOrigins: ["https://www.ironcladtournaments.com", "https://ironcladtournaments.com"],
    });
  });
  it.each([
    { COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV: "staging" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://unrelated-project.supabase.co" },
    { COMBAT_HIGHLIGHTS_WORKER_URL: "https://ironclad-staging-combat-highlights.synthetic-account.workers.dev" },
    { COMBAT_HIGHLIGHTS_WORKER_URL: "https://media.ironcladtournaments.com/private" },
    { COMBAT_HIGHLIGHTS_WORKER_URL: "https://user:pass@media.ironcladtournaments.com" },
    { COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS: "https://release-preview.vercel.app" },
    { COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS: "https://www.ironcladtournaments.com," },
    { COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK: "{}" },
    { VERCEL_ENV: "preview" },
  ])("fails closed for mismatched or incomplete contract %j", (override) => {
    expect(mediaConfiguration({ ...production, ...override })).toBeNull();
  });
  it("allows only unhosted loopback synthetic validation", () => {
    const local = {
      NODE_ENV: "test", COMBAT_HIGHLIGHTS_ENABLED: "true", COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV: "local",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", COMBAT_HIGHLIGHTS_WORKER_URL: "http://127.0.0.1:8787",
      COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS: "http://127.0.0.1:3138", COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK: key,
    };
    expect(mediaConfiguration(local)).not.toBeNull();
    expect(mediaConfiguration({ ...local, VERCEL_ENV: "preview" })).toBeNull();
    expect(mediaConfiguration({ ...local, NODE_ENV: "production" })).toBeNull();
    expect(mediaConfiguration({ ...local, NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL })).toBeNull();
    expect(mediaConfiguration({ ...local, COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS: "https://external.example" })).toBeNull();
  });
});
