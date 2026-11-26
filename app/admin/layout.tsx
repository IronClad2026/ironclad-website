import type { Metadata } from "next";
import type { ReactNode } from "react";

import AdminSidebar from "@/components/admin/AdminSidebar";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import englishCommon from "@/lib/i18n/dictionaries/en/common";
import { isReadyStagingEnabled } from "@/lib/ready/review-access";
import { isCasterProgramEnabled } from "@/lib/caster/environment";

export const metadata: Metadata = {
  title: "IronClad Admin",
  description: "IronClad competition administration.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider locale="en" dictionaries={{ common: englishCommon }}>
      <div
        lang="en"
        className="w-full min-w-0 xl:mx-auto xl:grid xl:max-w-[1680px] xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start"
      >
        <AdminSidebar showReadyUsage={isReadyStagingEnabled()} showCasterManagement={isCasterProgramEnabled()} />
        <div lang="en" className="min-w-0">
          {children}
        </div>
      </div>
    </LocaleProvider>
  );
}
