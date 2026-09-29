import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/content/legal-document-delivery.json";
import { resolveLegalDocumentDownloadUrl } from "@/lib/legal-document-delivery";
import type { RegistrationDocumentKind } from "@/lib/legal-document-types";

describe("verified legal PDF delivery", () => {
  it("binds all eleven bundled historical/current PDFs to their exact bytes", () => {
    expect(manifest.documents).toHaveLength(11);
    expect(new Set(manifest.documents.map((document) => `${document.kind}:${document.version}`)).size).toBe(11);
    expect(manifest.documents.map((document) => document.publicPath.split("/").at(-1)).sort()).toEqual(
      readdirSync("public/documents-rules-ppa").filter((name) => name.endsWith(".pdf")).sort()
    );
    for (const document of manifest.documents) {
      const bytes = readFileSync(resolve("public", `.${document.publicPath}`));
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(document.sha256);
      expect(resolveLegalDocumentDownloadUrl({ ...document, kind: document.kind as RegistrationDocumentKind })).toBe(document.publicPath);
    }
  });

  it("fails closed for unknown versions, mismatched hashes and mismatched kinds", () => {
    const document = { ...manifest.documents[0], kind: "rulebook" as const };
    expect(resolveLegalDocumentDownloadUrl({ ...document, version: "99.0" })).toBeNull();
    expect(resolveLegalDocumentDownloadUrl({ ...document, sha256: "a".repeat(64) })).toBeNull();
    expect(resolveLegalDocumentDownloadUrl({ ...document, sha256: document.sha256.toUpperCase() })).toBeNull();
    expect(resolveLegalDocumentDownloadUrl({ ...document, kind: "ppa" })).toBeNull();
    expect(resolveLegalDocumentDownloadUrl({ ...document, version: "3.0/../../other" })).toBeNull();
  });
});
