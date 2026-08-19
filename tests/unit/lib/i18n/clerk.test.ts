import { describe, expect, it } from "vitest";

import { enUS } from "@clerk/localizations/en-US";
import { esES } from "@clerk/localizations/es-ES";
import { frFR } from "@clerk/localizations/fr-FR";
import { koKR } from "@clerk/localizations/ko-KR";
import { ptBR } from "@clerk/localizations/pt-BR";
import { ruRU } from "@clerk/localizations/ru-RU";
import { zhCN } from "@clerk/localizations/zh-CN";

import { loadClerkLocalization } from "@/lib/i18n/clerk";

describe("Clerk locale mapping", () => {
  it.each([
    ["en", enUS],
    ["zh-CN", zhCN],
    ["ru", ruRU],
    ["es", esES],
    ["pt-BR", ptBR],
    ["ko", koKR],
    ["fr", frFR],
  ] as const)("maps %s to its exact Clerk locale pack", async (locale, pack) => {
    await expect(loadClerkLocalization(locale)).resolves.toBe(pack);
  });
});
