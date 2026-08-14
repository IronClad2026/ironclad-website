import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readDocument(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(
    /\r\n/g,
    "\n"
  );
}

describe("Phase 7 technical documentation", () => {
  it("distinguishes protected hard delete, Cancel, and Void", () => {
    const document = readDocument("docs/tournament-deletion.md");

    expect(document).toMatch(/hard delete[\s\S]*never\s+launched/i);
    expect(document).toMatch(/cannot\s+be[\s>]+permanently\s+deleted/i);
    expect(document).toMatch(/Cancel[\s\S]*without official competitive history/i);
    expect(document).toMatch(/Void[\s\S]*factual history remains/i);
    expect(document).not.toContain("there are no separate notification or\nchampion tables");
  });

  it("documents replay-only normal proof and legacy screenshot compatibility", () => {
    const document = readDocument("docs/admin-player-and-result-audit.md");

    expect(document).toMatch(/one replay[\s\S]*every game/i);
    expect(document).toMatch(/browser[\s\S]*private\s+`match-proofs`/i);
    expect(document).toMatch(/No screenshot is required/i);
    expect(document).toMatch(/legacy screenshot[\s\S]*historical/i);
    expect(document).not.toContain("replay/screenshot uploads");
    expect(document).not.toMatch(/Apply\s+`supabase\/migrations\//);
  });

  it("uses the current Next 16 proxy and public players smoke contract", () => {
    const document = readDocument("docs/testing.md");

    expect(document).toContain("proxy.ts");
    expect(document).toMatch(/`\/players`[\s\S]*public/i);
    expect(document).toContain("e2e/public-smoke.spec.ts");
    expect(document).not.toContain("middleware.ts");
    expect(document).not.toMatch(/`\/players` smoke contract is marked `fixme`/i);
  });
});
