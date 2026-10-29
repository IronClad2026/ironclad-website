// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HomeCollaborationSection from "@/components/HomeCollaborationSection";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import english from "@/lib/i18n/dictionaries/en/public";
import { loadDictionary } from "@/lib/i18n/loaders";

describe("homepage collaboration contact", () => {
  afterEach(cleanup);

  it("shows the requested English copy and an accessible email action", () => {
    render(<HomeCollaborationSection copy={english.home.collaboration} />);

    expect(
      screen.getByRole("region", { name: "Collaborate with IronClad" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We welcome sponsorship enquiries, partnership proposals, and ideas for collaboration."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute(
      "href",
      "mailto:ironclad.tournaments@gmail.com"
    );
    expect(screen.getByText("ironclad.tournaments@gmail.com")).toBeVisible();
  });

  it.each(SUPPORTED_LOCALES)(
    "renders the localised action and the same public address in %s",
    async (locale) => {
      const dictionary = await loadDictionary(locale, "public");
      const copy = dictionary.home.collaboration;

      render(<HomeCollaborationSection copy={copy} />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        copy.heading
      );
      expect(screen.getByRole("link", { name: copy.contact })).toHaveAttribute(
        "href",
        "mailto:ironclad.tournaments@gmail.com"
      );
      expect(screen.getByText(copy.body)).toBeVisible();
      if (locale !== "en") {
        for (const key of ["heading", "body", "contact"] as const) {
          expect(copy[key]).not.toBe(english.home.collaboration[key]);
        }
      }
    }
  );
});
