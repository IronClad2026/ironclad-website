import type { Metadata } from "next";

import LegalDocumentPage from "@/components/legal/LegalDocumentPage";

export const metadata: Metadata = {
  title: "Privacy Policy | IronClad Tournaments",
  description:
    "Read the effective IronClad Tournaments Privacy Policy and download the versioned PDF.",
};

export default function PrivacyPage() {
  return <LegalDocumentPage kind="privacy" />;
}
