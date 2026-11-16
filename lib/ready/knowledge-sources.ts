import deliveryManifest from "@/content/legal-document-delivery.json";
import type { RegistrationDocumentKind } from "@/lib/legal-document-types";

export const READY_KNOWLEDGE_REVISION = "2026-11-16.1";

export type ReadyDocumentVersions = Record<RegistrationDocumentKind, string>;

export const publishedReadyVersions: ReadyDocumentVersions = {
  rulebook: "3.2",
  ppa: "3.2",
  terms: "1.1",
  privacy: "1.3",
};

const documentTitles = {
  rulebook: "Official Tournament Rulebook",
  ppa: "Player Participation Agreement",
  terms: "Terms of Service",
  privacy: "Privacy Policy",
} satisfies Record<RegistrationDocumentKind, string>;

const documentScopes = {
  rulebook: "Competition mechanics and event administration",
  ppa: "Player participation and conduct",
  terms: "Use of the IronClad platform",
  privacy: "Handling of personal information",
} satisfies Record<RegistrationDocumentKind, string>;

const officialHost = "https://www.ironcladtournaments.com";

/** Historic deliveries reuse the same byte-verified artifacts supplied at registration. */
export function readyDocument(kind: RegistrationDocumentKind, version: string) {
  if (kind === "privacy" && version === "1.3") {
    return {
      title: "Privacy Policy v1.3",
      url: officialHost + "/privacy",
      version,
      status: "published-current",
      scope: documentScopes.privacy,
    } as const;
  }

  const delivery = deliveryManifest.documents.find(
    (document) => document.kind === kind && document.version === version,
  );
  if (!delivery) return null;

  return {
    title: `${documentTitles[kind]} v${version}`,
    url: delivery.publicPath,
    version,
    status: version === publishedReadyVersions[kind] ? "published-current" : "approved-version",
    scope: documentScopes[kind],
  } as const;
}

export const readyRulesHubSource = {
  title: "IronClad Competition Rules",
  url: "/rules",
  section: "Official Documents and Governing Status",
};
