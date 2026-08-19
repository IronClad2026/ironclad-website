// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminLayout from "@/app/admin/layout";
import LocaleProvider, {
  useLocale,
  useTranslations,
} from "@/components/i18n/LocaleProvider";
import russianCommon from "@/lib/i18n/dictionaries/ru/common";

function AdminBoundaryProbe() {
  const locale = useLocale();
  const t = useTranslations("common");

  return <span>{`${locale}:${t("nav.admin")}`}</span>;
}

describe("Admin locale boundary", () => {
  afterEach(cleanup);

  it("marks Admin content as English independently of player preference", () => {
    render(
      <AdminLayout>
        <span>Admin controls</span>
      </AdminLayout>
    );

    expect(screen.getByText("Admin controls").parentElement).toHaveAttribute(
      "lang",
      "en"
    );
  });

  it("overrides a non-English player context for shared Admin components", () => {
    render(
      <LocaleProvider locale="ru" dictionaries={{ common: russianCommon }}>
        <AdminLayout>
          <AdminBoundaryProbe />
        </AdminLayout>
      </LocaleProvider>
    );

    expect(screen.getByText("en:Admin")).toBeInTheDocument();
  });
});
