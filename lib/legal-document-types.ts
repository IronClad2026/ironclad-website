export type RegistrationDocumentKind =
  | "rulebook"
  | "ppa"
  | "terms"
  | "privacy";

export type RegistrationDocumentPresentation = {
  id: string;
  kind: RegistrationDocumentKind;
  version: string;
  url: string;
  effectiveDate: string;
  sha256: string;
};

export type RegistrationDocumentSet = {
  rulebook: RegistrationDocumentPresentation;
  ppa: RegistrationDocumentPresentation;
  terms: RegistrationDocumentPresentation;
  privacy: RegistrationDocumentPresentation;
};
