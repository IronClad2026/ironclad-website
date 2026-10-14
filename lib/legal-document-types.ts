export type RegistrationDocumentKind =
  | "rulebook"
  | "ppa"
  | "terms"
  | "privacy";

export type RegistrationDocumentPresentation = {
  id: string;
  kind: RegistrationDocumentKind;
  version: string;
  /** Immutable authority URL retained for identity and acceptance evidence. */
  url: string;
  /** Server-validated same-byte PDF location used only by document links. */
  downloadUrl: string;
  effectiveDate: string;
  sha256: string;
};

export type RegistrationDocumentSet = {
  rulebook: RegistrationDocumentPresentation;
  ppa: RegistrationDocumentPresentation;
  terms: RegistrationDocumentPresentation;
  privacy: RegistrationDocumentPresentation;
};
