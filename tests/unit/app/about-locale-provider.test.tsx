// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutLayout from "@/app/about/layout";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import russianPublic from "@/lib/i18n/dictionaries/ru/public";

vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: vi.fn(async () => "ru"),
}));

function AboutClientProbe() {
  const t = useTranslations("public");

  return <h1>{t("about.heroTitle")}</h1>;
}

describe("About locale provider", () => {
  afterEach(cleanup);

  it("supplies the selected public.about slice to client content", async () => {
    const view = await AboutLayout({ children: <AboutClientProbe /> });

    render(view);

    expect(screen.getByRole("heading")).toHaveTextContent(
      russianPublic.about.heroTitle
    );
    expect(screen.queryByText("about.heroTitle")).not.toBeInTheDocument();
  });
});
