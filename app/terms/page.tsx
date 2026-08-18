import type { Metadata } from "next";

import LegalDocumentPage from "@/components/legal/LegalDocumentPage";

export const metadata: Metadata = {
  title: "Terms of Service | IronClad Tournaments",
  description:
    "Read the effective IronClad Tournaments Terms of Service and download the versioned PDF.",
};

export default function TermsPage() {
  return <LegalDocumentPage kind="terms" />;
}
