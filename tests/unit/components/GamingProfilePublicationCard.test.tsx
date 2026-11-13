// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GamingProfilePublicationCard from "@/components/GamingProfilePublicationCard";
import { getGamingProfilePublicationCopy } from "@/lib/i18n/gaming-profile-publication";

vi.mock("@/app/profile/gaming-profile-publication-action", () => ({
  saveLegacyGamingProfilePublication: vi.fn(),
}));

const copy = getGamingProfilePublicationCopy("en");
afterEach(cleanup);

describe("gaming-profile publication control", () => {
  it("shows the future public profile disclosure before creation without a choice form", () => {
    render(<GamingProfilePublicationCard copy={copy} hasProfile={false}
      publication={{ mode: "new", public: false, revision: 0, objectionOpen: false }} />);

    expect(screen.getByText(copy.newProfileDisclosure)).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers an optional publication choice after the new profile exists", () => {
    render(<GamingProfilePublicationCard copy={copy} hasProfile
      publication={{ mode: "new", public: false, revision: 1, objectionOpen: false }} />);

    expect(screen.getByRole("checkbox", { name: copy.confirmationLabel })).not.toBeChecked();
    expect(screen.getByRole("button", { name: copy.publish })).toBeVisible();
  });

  it("requires an unticked publication confirmation for a protected legacy profile", () => {
    render(<GamingProfilePublicationCard copy={copy} hasProfile
      publication={{ mode: "legacy", public: false, revision: 0, objectionOpen: false }} />);

    const checkbox = screen.getByRole("checkbox", { name: copy.confirmationLabel });
    expect(checkbox).toBeRequired();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: copy.publish })).toBeVisible();
  });

  it("keeps the private choice available during an objection without exposing a publish control", () => {
    render(<GamingProfilePublicationCard copy={copy} hasProfile
      publication={{ mode: "legacy", public: false, revision: 3, objectionOpen: true }} />);

    expect(screen.getByText(copy.objectionStatus)).toBeVisible();
    expect(screen.getByRole("button", { name: copy.keepPrivate })).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.publish })).not.toBeInTheDocument();
  });
});
