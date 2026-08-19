import type { Metadata } from "next";
import type { ReactNode } from "react";

import LocaleProvider from "@/components/i18n/LocaleProvider";
import englishCommon from "@/lib/i18n/dictionaries/en/common";

export const metadata: Metadata = {
  title: "IronClad Admin",
  description: "IronClad competition administration.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider locale="en" dictionaries={{ common: englishCommon }}>
      <div lang="en">{children}</div>
    </LocaleProvider>
  );
}
