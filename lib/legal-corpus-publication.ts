import rawLegalCorpus from "@/content/legal-corpus.json";

export type LegalDocumentKind = "rulebook" | "ppa" | "terms" | "privacy";

export type LegalContentBlock =
  | { type: "paragraph"; number?: string; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; title: string; text: string };

export type LegalDocument = {
  kind: LegalDocumentKind;
  title: string;
  shortTitle: string;
  subtitle: string;
  version: string;
  status: string;
  effectiveDate: string;
  filename: string;
  publicPath: string;
  operatorStatement: string;
  introBlocks: LegalContentBlock[];
  sections: {
    number: string;
    title: string;
    blocks: LegalContentBlock[];
  }[];
};

type LegalCorpus = {
  schemaVersion: number;
  effectiveDate: string;
  effectiveDateDisplay: string;
  activationDatePolicy: string;
  documents: LegalDocument[];
};

export const legalCorpus = rawLegalCorpus as unknown as LegalCorpus;

export function getLegalDocument(kind: LegalDocumentKind) {
  const document = legalCorpus.documents.find(
    (candidate) => candidate.kind === kind
  );

  if (!document) {
    throw new Error(`Missing ${kind} document in the legal corpus.`);
  }

  return document;
}

export function getLegalDocumentEffectiveDateDisplay(
  document: Pick<LegalDocument, "effectiveDate">
) {
  const [year, month, day] = document.effectiveDate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Invalid legal-document effective date.");
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function resolveEffectiveDateToken(
  value: string,
  document: Pick<LegalDocument, "effectiveDate">
) {
  return value.replaceAll(
    "{{EFFECTIVE_DATE}}",
    getLegalDocumentEffectiveDateDisplay(document)
  );
}
