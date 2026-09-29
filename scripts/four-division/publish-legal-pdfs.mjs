// Publishes only the two reviewed PDF artifacts. The default is a local plan.
// No application access settings, database records, or existing bucket policies
// are modified. The live command requires explicit --apply.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadFixtureEnvironment, validateRuntimeGuards, assertClerkDevelopmentInstance } from "../lib/staging-synthetic-uat.mjs";
import { validateFourDivisionLegalRelease, getFourDivisionLegalDocumentUrl, STAGING_LEGAL_BUCKET, STAGING_LEGAL_STORAGE_ORIGIN } from "./legal-publication.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
export const LEGAL_PDF_BUCKET_OPTIONS = Object.freeze({ public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["application/pdf"] });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function buildLegalPdfPublicationPlan(root = repository) {
  const release = validateFourDivisionLegalRelease(root);
  const documents = [];
  for (const document of release.documents) {
    const bytes = await readFile(resolve(root, "public", `.${document.publicPath}`));
    assert(bytes.length <= LEGAL_PDF_BUCKET_OPTIONS.fileSizeLimit && bytes.subarray(0, 5).toString() === "%PDF-");
    assert.equal(sha256(bytes), document.sha256);
    documents.push({ kind: document.kind, filename: document.filename, sha256: document.sha256, byteLength: bytes.length,
      objectPath: `${document.sha256}/${document.filename}`, url: getFourDivisionLegalDocumentUrl(document, STAGING_LEGAL_STORAGE_ORIGIN) });
  }
  return { status: "plan", bucket: STAGING_LEGAL_BUCKET, bucketOptions: LEGAL_PDF_BUCKET_OPTIONS, documents, remoteWrites: 0 };
}

export async function publishLegalPdfs({ storage, root = repository, fetchImpl = globalThis.fetch }) {
  const plan = await buildLegalPdfPublicationPlan(root);
  const bucket = await storage.getBucket(STAGING_LEGAL_BUCKET);
  let bucketCreated = false;
  if (bucket.error) {
    assert(String(bucket.error.statusCode) === "404" || bucket.error.message === "Bucket not found", "bucket_inspection_failed");
    const created = await storage.createBucket(STAGING_LEGAL_BUCKET, LEGAL_PDF_BUCKET_OPTIONS);
    assert(!created.error, "bucket_creation_failed");
    bucketCreated = true;
  } else {
    assert.equal(bucket.data.id, STAGING_LEGAL_BUCKET);
    assert.equal(bucket.data.public, true);
    assert.equal(Number(bucket.data.file_size_limit), LEGAL_PDF_BUCKET_OPTIONS.fileSizeLimit);
    assert.deepEqual(bucket.data.allowed_mime_types, ["application/pdf"]);
  }
  const files = storage.from(STAGING_LEGAL_BUCKET);
  const roots = await files.list("", { limit: 100 });
  assert(!roots.error && roots.data.length <= 2 && roots.data.every((entry) => plan.documents.some((document) => entry.name === document.sha256) && !entry.id), "unexpected_bucket_contents");
  const results = [];
  for (const document of plan.documents) {
    const existing = await files.list(document.sha256, { limit: 100 });
    assert(!existing.error && existing.data.length <= 1 && existing.data.every((entry) => entry.name === document.filename && entry.id), "unexpected_hash_directory_contents");
    if (!existing.data.length) {
      const bytes = await readFile(resolve(root, "public/documents-rules-ppa", document.filename));
      assert.equal(sha256(bytes), document.sha256);
      const uploaded = await files.upload(document.objectPath, bytes, { contentType: "application/pdf", cacheControl: "31536000", upsert: false });
      assert(!uploaded.error, "immutable_pdf_upload_failed");
    }
    // Anonymous GET deliberately carries no authentication headers or cookies.
    const response = await fetchImpl(document.url, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(30_000) });
    assert(response.ok && response.headers.get("content-type")?.split(";")[0].trim() === "application/pdf", "anonymous_pdf_read_failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, document.byteLength);
    assert.equal(sha256(bytes), document.sha256);
    results.push({ kind: document.kind, url: document.url, sha256: document.sha256, byteLength: bytes.length, uploaded: !existing.data.length, anonymousHashVerified: true });
  }
  return { status: "published", bucket: STAGING_LEGAL_BUCKET, bucketCreated, bucketOptions: LEGAL_PDF_BUCKET_OPTIONS, documents: results, legalRegisterChanged: false, existingPoliciesChanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert(process.argv.length <= 3 && (!process.argv[2] || ["--check", "--apply"].includes(process.argv[2])));
    if (process.argv[2] !== "--apply") console.log(JSON.stringify(await buildLegalPdfPublicationPlan(), null, 2));
    else {
      const env = await loadFixtureEnvironment({ rootDir: source, processEnv: {} });
      const config = validateRuntimeGuards(env, "TestMain1");
      await assertClerkDevelopmentInstance(config);
      const client = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await publishLegalPdfs({ storage: client.storage });
      await mkdir(resolve(repository, "test-results/four-division"), { recursive: true });
      await writeFile(resolve(repository, "test-results/four-division/legal-pdf-publication-evidence.json"), JSON.stringify(result, null, 2) + "\n");
      console.log(JSON.stringify(result, null, 2));
    }
  } catch {
    console.error(JSON.stringify({ status: "legal_pdf_publication_failed", credentialsIncluded: false }));
    process.exitCode = 1;
  }
}
