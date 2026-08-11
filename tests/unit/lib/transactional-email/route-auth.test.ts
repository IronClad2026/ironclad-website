import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeTransactionalEmailWorkerRequest } from "@/lib/transactional-email/route-auth";

describe("transactional email worker route authorization", () => {
  it("fails closed when the configured secret is missing or blank", () => {
    expect(authorizeTransactionalEmailWorkerRequest(null, undefined)).toBe(
      "unavailable"
    );
    expect(authorizeTransactionalEmailWorkerRequest(null, "   ")).toBe(
      "unavailable"
    );
  });

  it.each([
    null,
    "",
    "Basic worker-secret",
    "bearer worker-secret",
    "Bearer",
    "Bearer ",
    "Bearer  worker-secret",
    "Bearer worker-secret ",
    "Bearer wrong-secret",
  ])("rejects an invalid bearer header without exposing detail", (header) => {
    expect(
      authorizeTransactionalEmailWorkerRequest(header, "worker-secret")
    ).toBe("unauthorized");
  });

  it("accepts only the exact configured bearer credential", () => {
    expect(
      authorizeTransactionalEmailWorkerRequest(
        "Bearer worker-secret",
        "worker-secret"
      )
    ).toBe("authorized");
  });

  it("hashes both secrets with SHA-256 before fixed-length comparison", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/transactional-email/route-auth.ts"),
      "utf8"
    );

    expect(source).toContain('createHash("sha256")');
    expect(source).toContain("const expectedDigest = digestSecret(");
    expect(source).toContain("const suppliedDigest = digestSecret(");
    expect(source).toContain(
      "timingSafeEqual(expectedDigest, suppliedDigest)"
    );
    expect(source).not.toMatch(/timingSafeEqual\([^)]*configuredSecret/);
    expect(source).not.toMatch(/timingSafeEqual\([^)]*authorizationHeader/);
  });
});
