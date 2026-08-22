import { describe, expect, it } from "vitest";
import {
  DICTIONARY_NAMESPACES,
  assertLaunchDictionariesValid,
  loadDictionaries,
  loadDictionary,
} from "@/lib/i18n/loaders";

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

  it("validates every launch locale and namespace against English", async () => {
    await expect(assertLaunchDictionariesValid()).resolves.toBeUndefined();
  });
});
