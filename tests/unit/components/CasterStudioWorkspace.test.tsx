// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CasterStudioWorkspace from "@/app/caster-studio/CasterStudioWorkspace";
import { getStudioWorkspaceCopy } from "@/app/caster-studio/studio-workspace-copy";
import { emptyCasterDraft, type CasterPhase2Application } from "@/lib/caster/application";
import { getCasterApplicationCopy } from "@/lib/caster/application-copy";
import { getCasterProfileCopy } from "@/lib/caster/profile-copy";
import type { CasterWorkingProfile } from "@/lib/caster/publication";
import { SUPPORTED_LOCALES, toIntlLocale, type Locale } from "@/lib/i18n/config";

const draft = {
  ...emptyCasterDraft(),
  displayName: "Staging Portfolio",
  country: "AU",
  discord: "private-contact",
  videos: ["https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
  gallery: ["20000000-0000-4000-8000-000000000001"],
};
const profile: CasterWorkingProfile = {
  draft, version: 8, show_country: false, slug: "staging-portfolio", publication_id: "revision",
  published_version: 8, hidden: false, membership_status: "active",
};
const application: CasterPhase2Application = {
  id: "10000000-0000-4000-8000-000000000001", status: "approved", draft, draft_version: 1,
  submitted_revision_id: null, revision: null, feedback: null, membership_active: true,
};
const copy = getStudioWorkspaceCopy("en");
const composer = vi.fn();

function openWorkspace(options: Partial<Parameters<typeof CasterStudioWorkspace>[0]> & { locale?: Locale } = {}) {
  const locale = options.locale ?? "en";
  return render(
    <CasterStudioWorkspace application={application} profile={profile} locale={locale} intlLocale={toIntlLocale(locale)}
      email="private@example.test" countries={[{ code: "AU", label: "Australia" }]} copy={getStudioWorkspaceCopy(locale)}
      applicationCopy={getCasterApplicationCopy(locale)} profileCopy={getCasterProfileCopy(locale)}
      actionCopy={{ programme: "Official Caster Programme", signOut: "Sign out", support: "Contact support", retry: "Retry" }}
      signOutFailed={false}
      activity={{ publishedCount: 2, tournamentIds: ["first", "second"], recent: [] }}
      verifiedTournamentIds={["second", "third"]} portfolioCoverage={[]} portfolioVideos={[]}
      videos={<button id="publish-tournament-video" type="button" onClick={composer}>Open composer</button>}
      history={<p>Verified historical recording</p>} notifications={null} {...options}
    />,
  );
}

beforeEach(() => {
  composer.mockClear();
  window.history.replaceState(null, "", "/caster-studio");
});

afterEach(cleanup);

describe("Creator Studio workspace", () => {
  it("opens Overview with five sections and computes distinct coverage from both sources", () => {
    openWorkspace();
    const nav = within(screen.getByRole("navigation", { name: copy.navigation }));
    expect(nav.getByRole("button", { name: copy.overview })).toHaveAttribute("aria-current", "page");
    expect(nav.getAllByRole("button").map((control) => control.textContent)).toEqual([
      copy.overview, copy.profile, copy.media, copy.videos, copy.history,
    ]);
    expect(screen.getByText(copy.publishedVideos).nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText(copy.distinctTournaments).nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText(copy.featuredMedia).nextElementSibling).toHaveTextContent("2");
    expect(screen.queryByText("private@example.test")).toBeNull();
    expect(screen.queryByText(draft.discord)).toBeNull();
  });

  it("keeps unsaved profile edits when moving among workspace sections", () => {
    openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: copy.editProfile }));
    const name = screen.getByRole("textbox", { name: /Caster display name/ });
    fireEvent.change(name, { target: { value: "Unpublished sample" } });
    fireEvent.click(screen.getByRole("button", { name: copy.media }));
    expect(screen.getByRole("heading", { name: copy.media })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy.history }));
    expect(screen.getByText("Verified historical recording")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy.overview }));
    expect(screen.getByText(copy.unpublished)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy.profile }));
    expect(screen.getByRole("textbox", { name: /Caster display name/ })).toHaveValue("Unpublished sample");
    expect(window.location.search).toBe("?section=profile");
  });

  it("opens the tournament composer from Overview when the composer is available", async () => {
    openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: copy.publishVideo }));
    await waitFor(() => expect(composer).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: copy.videos })).toHaveAttribute("aria-current", "page");
  });

  it.each(SUPPORTED_LOCALES)("renders the five navigation items in %s", (locale) => {
    openWorkspace({ locale });
    const localized = getStudioWorkspaceCopy(locale);
    const nav = within(screen.getByRole("navigation", { name: localized.navigation }));
    for (const section of ["overview", "profile", "media", "videos", "history"] as const) {
      expect(nav.getByRole("button", { name: localized[section] })).toBeVisible();
    }
  });
});
