import "server-only";

import deliveryManifest from "@/content/legal-document-delivery.json";
import type { RegistrationDocumentKind } from "@/lib/legal-document-types";

/** A delivery location never replaces the immutable authority URL or identity. */
export function resolveLegalDocumentDownloadUrl({
  kind,
  version,
  sha256,
}: {
  kind: RegistrationDocumentKind;
  version: string;
  sha256: string;
}): string | null {
  if (deliveryManifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(sha256)) {
    return null;
  }

  const matches = deliveryManifest.documents.filter(
    (document) => document.kind === kind && document.version === version
  );
  if (matches.length !== 1 || matches[0].sha256 !== sha256) {
    return null;
  }

  const path = matches[0].publicPath;
  return /^\/documents-rules-ppa\/ironclad-[a-z-]+-v\d+\.\d+\.pdf$/.test(path)
    ? path
    : null;
}
