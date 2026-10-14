import { describe, expect, it, vi } from "vitest";
import manifest from "@/content/legal-document-delivery.json";
import { loadEffectiveRegistrationDocumentSet } from "@/lib/legal-documents";

function fixture() {
  const kinds = ["rulebook", "ppa", "terms", "privacy"];
  const rows = kinds.map((kind, index) => {
    const document = manifest.documents.find((candidate) => candidate.kind === kind)!;
    return { id: `11111111-1111-4111-8111-11111111111${index}`, document_kind: kind,
      version: document.version, sha256: document.sha256, status: "effective", effective_at: "2026-08-01T00:00:00Z",
      immutable_url: `https://retired-preview.example${document.publicPath}` };
  });
  return rows;
}

function client(rows: ReturnType<typeof fixture>) {
  const eq = vi.fn(async () => ({ data: rows, error: null }));
  const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
  return { supabase: { from } as unknown as Parameters<typeof loadEffectiveRegistrationDocumentSet>[0], from };
}

describe("registration legal delivery projection", () => {
  it("preserves authority URLs, IDs, versions and hashes while presenting verified relative downloads", async () => {
    const rows = fixture();
    const before = structuredClone(rows);
    const { supabase, from } = client(rows);
    const result = await loadEffectiveRegistrationDocumentSet(supabase);
    expect(result).not.toBeNull();
    for (const row of rows) {
      const document = Object.values(result!).find((value) => value.kind === row.document_kind)!;
      expect(document).toMatchObject({ id: row.id, version: row.version, sha256: row.sha256, url: row.immutable_url });
      expect(document.downloadUrl).toBe(new URL(row.immutable_url).pathname);
      expect(document.downloadUrl).not.toBe(document.url);
    }
    expect(rows).toEqual(before);
    expect(from).toHaveBeenCalledExactlyOnceWith("legal_documents");
  });

  it.each(["version", "sha256"] as const)("refuses the whole set when %s is unknown or mismatched", async (field) => {
    const rows = fixture();
    rows[0][field] = field === "version" ? "99.0" : "a".repeat(64);
    await expect(loadEffectiveRegistrationDocumentSet(client(rows).supabase)).resolves.toBeNull();
  });
});
