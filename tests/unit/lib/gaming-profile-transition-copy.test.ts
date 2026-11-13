import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { getGamingProfilePublicationCopy } from "@/lib/i18n/gaming-profile-publication";
import { getPublicGamingProfileNoticeCopy } from "@/lib/i18n/public-gaming-profile-notice";

describe("gaming profile transition copy", () => {
  it.each(SUPPORTED_LOCALES)("keeps the original notice and separates acknowledgement from publication in %s", (locale) => {
    const original = getPublicGamingProfileNoticeCopy(locale, "public-gaming-profile-v1");
    const transition = getPublicGamingProfileNoticeCopy(locale, "public-gaming-profile-v2");
    const publication = getGamingProfilePublicationCopy(locale);

    expect(getPublicGamingProfileNoticeCopy(locale)).toEqual(original);
    expect(original.legacyVisibility).toBeUndefined();
    expect(transition.publicFields).not.toBe(original.publicFields);
    expect(transition.legacyVisibility).toEqual(expect.any(String));
    expect(transition.checkbox).not.toBe(original.checkbox);
    expect(transition.checkbox).not.toBe(publication.confirmationLabel);
    expect(transition.privateFields).toBe(original.privateFields);
    expect(transition.contact).toBe(original.contact);
    expect(publication.newProfileDisclosure).toContain("Discord");
    expect(publication.keepPrivate).not.toBe(publication.publish);
  });

  it("explains the existing profile protections without changing historical visibility at sign-in", () => {
    const notice = getPublicGamingProfileNoticeCopy("en", "public-gaming-profile-v2");
    const publication = getGamingProfilePublicationCopy("en");

    expect(notice.legacyVisibility).toMatch(/was off.*unclear.*objection.*does not change your visibility/i);
    expect(publication.description).toContain("published separately");
    expect(publication.confirmationLabel).toMatch(/^I choose to publish/);
    expect(publication.objectionStatus).toContain("while we review a privacy objection");
  });
});
