import { describe, expect, it } from "vitest";
import {
  DICTIONARY_NAMESPACES,
  assertLaunchDictionariesValid,
  loadDictionaries,
  loadDictionary,
} from "@/lib/i18n/loaders";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";

const PR3_REGISTRATION_MESSAGE_KEYS = [
  "dialogDescription",
  "selectedTournament",
  "changeTournament",
  "readinessTitle",
  "profileReady",
  "steamConnected",
  "relicVerificationOnSubmit",
  "reviewSavedDetails",
  "stepProgress",
  "waitlistJoinedTitle",
  "waitlistPositionPending",
  "waitlistResultDescription",
  "submittedTitle",
  "reviewTime",
] as const;

const PR4_ANNOUNCEMENT_MESSAGE_KEYS = [
  "metadataTitle",
  "metadataDescription",
  "eyebrow",
  "title",
  "description",
  "feedLabel",
  "emptyTitle",
  "emptyDescription",
  "published",
  "publicationTimeUnavailable",
  "imageAltFallback",
  "videoLabelFallback",
  "videoUnsupported",
  "viewTournament",
  "loadErrorTitle",
  "loadErrorDescription",
  "retry",
] as const;

describe("server dictionary loader", () => {
  it("loads all seven Italian Player namespaces", async () => {
    expect(DICTIONARY_NAMESPACES).toEqual([
      "common",
      "public",
      "account-dashboard",
      "competition",
      "notifications",
      "email",
      "help-legal-ui",
    ]);

    const dictionaries = await loadDictionaries(
      "it",
      DICTIONARY_NAMESPACES
    );

    expect(Object.keys(dictionaries)).toEqual(DICTIONARY_NAMESPACES);
  });

  it("loads one resolved locale/namespace slice", async () => {
    const common = await loadDictionary("fr", "common");

    expect(common.nav.home).toBe("Accueil");
    expect(common.selector.privacyPolicyLink).toBe(
      "Lire la Politique de confidentialité"
    );
  });

  it("returns only the requested namespace keys", async () => {
    const dictionaries = await loadDictionaries("zh-CN", [
      "common",
      "public",
    ] as const);

    expect(Object.keys(dictionaries)).toEqual(["common", "public"]);
    expect(dictionaries.common.nav.tournaments).toBe("锦标赛");
  });

  it("loads dedicated duplicate replay feedback in all eight Player locales", async () => {
    const messages = await Promise.all(
      SUPPORTED_LOCALES.map(async (locale) => {
        const competition = await loadDictionary(locale, "competition");
        return competition.matchAction.duplicateReplay;
      })
    );

    expect(SUPPORTED_LOCALES).toHaveLength(8);
    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(8);
  });

  it("loads distinct PR3 mobile registration copy in all eight Player locales", async () => {
    const messagesByLocale = await Promise.all(
      SUPPORTED_LOCALES.map(async (locale) => {
        const competition = await loadDictionary(locale, "competition");
        return PR3_REGISTRATION_MESSAGE_KEYS.map(
          (key) => competition.registrationModal[key]
        );
      })
    );

    expect(SUPPORTED_LOCALES).toHaveLength(8);
    for (const messages of messagesByLocale) {
      expect(messages.every((message) => message.trim().length > 0)).toBe(true);
      expect(new Set(messages).size).toBe(PR3_REGISTRATION_MESSAGE_KEYS.length);
    }
    for (let index = 0; index < PR3_REGISTRATION_MESSAGE_KEYS.length; index += 1) {
      const localizedMessages = messagesByLocale.map(
        (messages) => messages[index]
      );
      expect(new Set(localizedMessages).size).toBe(SUPPORTED_LOCALES.length);
    }
  });

  it("loads complete localized PR4 Announcement system UI in all eight Player locales", async () => {
    const messagesByLocale = await Promise.all(
      SUPPORTED_LOCALES.map(async (locale) => {
        const [common, publicDictionary] = await Promise.all([
          loadDictionary(locale, "common"),
          loadDictionary(locale, "public"),
        ]);
        return [
          common.nav.announcements,
          common.nav.announcementsUnread,
          ...PR4_ANNOUNCEMENT_MESSAGE_KEYS.map(
            (key) => publicDictionary.announcements[key]
          ),
        ];
      })
    );

    expect(SUPPORTED_LOCALES).toHaveLength(8);
    for (const messages of messagesByLocale) {
      expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    }
    for (const index of [0, 1, 2, 5]) {
      expect(
        new Set(messagesByLocale.map((messages) => messages[index])).size
      ).toBe(SUPPORTED_LOCALES.length);
    }
  });

  it("validates every launch locale and namespace against English", async () => {
    await expect(assertLaunchDictionariesValid()).resolves.toBeUndefined();
  });
});
