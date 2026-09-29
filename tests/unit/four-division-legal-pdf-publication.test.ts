import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildLegalPdfPublicationPlan, publishLegalPdfs, LEGAL_PDF_BUCKET_OPTIONS } from "../../scripts/four-division/publish-legal-pdfs.mjs";
import { STAGING_LEGAL_BUCKET } from "../../scripts/four-division/legal-publication.mjs";

async function fixture(existing = false) {
  const plan = await buildLegalPdfPublicationPlan();
  const entries = new Set(existing ? plan.documents.map((document) => document.objectPath) : []);
  const files = {
    list: vi.fn(async (prefix: string) => ({ error: null, data: prefix
      ? [...entries].filter((entry) => entry.startsWith(prefix + "/")).map((entry) => ({ name: entry.split("/")[1], id: "object" }))
      : [...new Set([...entries].map((entry) => entry.split("/")[0]))].map((name) => ({ name, id: null })) })),
    upload: vi.fn(async (name: string) => { entries.add(name); return { error: null }; }),
  };
  const storage = {
    getBucket: vi.fn(async () => existing
      ? { error: null, data: { id: STAGING_LEGAL_BUCKET, public: true, file_size_limit: 2097152, allowed_mime_types: ["application/pdf"] } }
      : { error: { statusCode: "404" }, data: null }),
    createBucket: vi.fn(async () => ({ error: null })),
    from: vi.fn(() => files),
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const document = plan.documents.find((candidate) => candidate.url === String(url));
    if (!document) throw new Error("unexpected URL");
    return new Response(readFileSync(resolve("public/documents-rules-ppa", document.filename)), { headers: { "content-type": "application/pdf" } });
  });
  return { plan, storage, files, fetchImpl };
}

describe("Staging public legal PDFs only", () => {
  it("plans exactly two local PDFs without creating a bucket or changing records", async () => {
    const plan = await buildLegalPdfPublicationPlan();
    expect(plan.documents).toHaveLength(2);
    expect(plan.remoteWrites).toBe(0);
    expect(plan.bucketOptions).toEqual({ public: true, fileSizeLimit: 2097152, allowedMimeTypes: ["application/pdf"] });
  });

  it("creates the dedicated PDF-only bucket and uploads immutable files with anonymous hash checks", async () => {
    const f = await fixture();
    const result = await publishLegalPdfs(f);
    expect(f.storage.createBucket).toHaveBeenCalledWith(STAGING_LEGAL_BUCKET, LEGAL_PDF_BUCKET_OPTIONS);
    expect(f.files.upload).toHaveBeenCalledTimes(2);
    for (const call of f.files.upload.mock.calls as unknown[][]) expect(call[2]).toEqual({ contentType: "application/pdf", cacheControl: "31536000", upsert: false });
    for (const call of f.fetchImpl.mock.calls as unknown[][]) expect(call[1]).toMatchObject({ redirect: "error", credentials: "omit" });
    expect(result).toMatchObject({ status: "published", bucketCreated: true, legalRegisterChanged: false, existingPoliciesChanged: false });
    expect(result.documents.every((document) => document.anonymousHashVerified)).toBe(true);
  });

  it("reuses exact existing PDF bytes without overwriting or updating configuration", async () => {
    const f = await fixture(true);
    const result = await publishLegalPdfs(f);
    expect(f.storage.createBucket).not.toHaveBeenCalled();
    expect(f.files.upload).not.toHaveBeenCalled();
    expect(result.documents.every((document) => document.uploaded === false)).toBe(true);
  });

  it("rejects wrong bucket policy, unexpected objects, and nonmatching anonymous bytes", async () => {
    const policy = await fixture(true);
    policy.storage.getBucket.mockResolvedValueOnce({ error: null, data: { id: STAGING_LEGAL_BUCKET, public: false, file_size_limit: 2097152, allowed_mime_types: ["application/pdf"] } });
    await expect(publishLegalPdfs(policy)).rejects.toThrow();
    expect(policy.files.upload).not.toHaveBeenCalled();
    const objects = await fixture(true);
    objects.files.list.mockResolvedValueOnce({ error: null, data: [{ name: "unapproved", id: null }] });
    await expect(publishLegalPdfs(objects)).rejects.toThrow("unexpected_bucket_contents");
    const bytes = await fixture(true);
    bytes.fetchImpl.mockResolvedValueOnce(new Response("wrong bytes", { headers: { "content-type": "application/pdf" } }));
    await expect(publishLegalPdfs(bytes)).rejects.toThrow();
    expect(bytes.files.upload).not.toHaveBeenCalled();
  });
});
