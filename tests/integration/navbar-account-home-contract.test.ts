import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeAccountSource = readFileSync(
  resolve(process.cwd(), "components/HomeAccountSection.tsx"),
  "utf8"
);

describe("PR 6 global Navbar account placement", () => {
  it("removes only the duplicate Clerk control from the Home Player card", () => {
    expect(homeAccountSource).not.toContain("IronCladUserButton");
    expect(homeAccountSource).toContain('href="/sign-in"');
    expect(homeAccountSource).toContain('href="/sign-up"');
    expect(homeAccountSource).toContain('href="/dashboard"');
    expect(homeAccountSource).toContain('href="/profile"');
    expect(homeAccountSource).toContain('href="/tournaments"');
    expect(homeAccountSource).toContain("<PlayerAvatar");
    expect(homeAccountSource).toContain("<ProfileValue");
  });
});
