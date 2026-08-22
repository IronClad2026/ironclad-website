import "server-only";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import type { DictionaryTree } from "@/lib/i18n/types";
import {
  validateDictionary,
  type DictionaryValidationIssue,
} from "@/lib/i18n/validation";
import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";
import type { AccountDashboardDictionary } from "@/lib/i18n/dictionaries/en/account-dashboard";
import type { CompetitionDictionary } from "@/lib/i18n/dictionaries/en/competition";
import type { NotificationsDictionary } from "@/lib/i18n/dictionaries/en/notifications";
import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";
import type { HelpLegalUiDictionary } from "@/lib/i18n/dictionaries/en/help-legal-ui";

export type DictionaryByNamespace = {
  common: CommonDictionary;
  public: PublicDictionary;
  "account-dashboard": AccountDashboardDictionary;
  competition: CompetitionDictionary;
  notifications: NotificationsDictionary;
  email: EmailDictionary;
  "help-legal-ui": HelpLegalUiDictionary;
};

export type DictionaryNamespace = keyof DictionaryByNamespace;

export const DICTIONARY_NAMESPACES = [
  "common",
  "public",
  "account-dashboard",
  "competition",
  "notifications",
  "email",
  "help-legal-ui",
] as const satisfies readonly DictionaryNamespace[];

type DictionaryModule<Namespace extends DictionaryNamespace> = {
  default: DictionaryByNamespace[Namespace];
};

type NamespaceLoaders = {
  [Namespace in DictionaryNamespace]: () => Promise<
    DictionaryModule<Namespace>
  >;
};

const DICTIONARY_LOADERS = {
  en: {
    common: () => import("@/lib/i18n/dictionaries/en/common"),
    public: () => import("@/lib/i18n/dictionaries/en/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/en/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/en/competition"),
    notifications: () => import("@/lib/i18n/dictionaries/en/notifications"),
    email: () => import("@/lib/i18n/dictionaries/en/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/en/help-legal-ui"),
  },
  it: {
    common: () => import("@/lib/i18n/dictionaries/it/common"),
    public: () => import("@/lib/i18n/dictionaries/it/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/it/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/it/competition"),
    notifications: () =>
      import("@/lib/i18n/dictionaries/it/notifications"),
    email: () => import("@/lib/i18n/dictionaries/it/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/it/help-legal-ui"),
  },
  "zh-CN": {
    common: () => import("@/lib/i18n/dictionaries/zh-CN/common"),
    public: () => import("@/lib/i18n/dictionaries/zh-CN/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/zh-CN/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/zh-CN/competition"),
    notifications: () =>
      import("@/lib/i18n/dictionaries/zh-CN/notifications"),
    email: () => import("@/lib/i18n/dictionaries/zh-CN/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/zh-CN/help-legal-ui"),
  },
  ru: {
    common: () => import("@/lib/i18n/dictionaries/ru/common"),
    public: () => import("@/lib/i18n/dictionaries/ru/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/ru/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/ru/competition"),
    notifications: () => import("@/lib/i18n/dictionaries/ru/notifications"),
    email: () => import("@/lib/i18n/dictionaries/ru/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/ru/help-legal-ui"),
  },
  es: {
    common: () => import("@/lib/i18n/dictionaries/es/common"),
    public: () => import("@/lib/i18n/dictionaries/es/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/es/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/es/competition"),
    notifications: () => import("@/lib/i18n/dictionaries/es/notifications"),
    email: () => import("@/lib/i18n/dictionaries/es/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/es/help-legal-ui"),
  },
  "pt-BR": {
    common: () => import("@/lib/i18n/dictionaries/pt-BR/common"),
    public: () => import("@/lib/i18n/dictionaries/pt-BR/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/pt-BR/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/pt-BR/competition"),
    notifications: () =>
      import("@/lib/i18n/dictionaries/pt-BR/notifications"),
    email: () => import("@/lib/i18n/dictionaries/pt-BR/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/pt-BR/help-legal-ui"),
  },
  ko: {
    common: () => import("@/lib/i18n/dictionaries/ko/common"),
    public: () => import("@/lib/i18n/dictionaries/ko/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/ko/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/ko/competition"),
    notifications: () => import("@/lib/i18n/dictionaries/ko/notifications"),
    email: () => import("@/lib/i18n/dictionaries/ko/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/ko/help-legal-ui"),
  },
  fr: {
    common: () => import("@/lib/i18n/dictionaries/fr/common"),
    public: () => import("@/lib/i18n/dictionaries/fr/public"),
    "account-dashboard": () =>
      import("@/lib/i18n/dictionaries/fr/account-dashboard"),
    competition: () => import("@/lib/i18n/dictionaries/fr/competition"),
    notifications: () => import("@/lib/i18n/dictionaries/fr/notifications"),
    email: () => import("@/lib/i18n/dictionaries/fr/email"),
    "help-legal-ui": () =>
      import("@/lib/i18n/dictionaries/fr/help-legal-ui"),
  },
} satisfies Record<Locale, NamespaceLoaders>;

export type LoadedDictionaries<
  Namespaces extends readonly DictionaryNamespace[],
> = {
  [Namespace in Namespaces[number]]: DictionaryByNamespace[Namespace];
};

function isDictionaryTree(value: unknown): value is DictionaryTree {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (child) => typeof child === "string" || isDictionaryTree(child)
  );
}

function overlayDictionary(
  english: DictionaryTree,
  selected: unknown
): DictionaryTree {
  if (!isDictionaryTree(selected)) {
    return english;
  }

  const resolved: Record<string, string | DictionaryTree> = {};

  for (const [key, englishValue] of Object.entries(english)) {
    const selectedValue = selected[key];

    if (typeof englishValue === "string") {
      resolved[key] =
        typeof selectedValue === "string" && selectedValue.trim().length > 0
          ? selectedValue
          : englishValue;
      continue;
    }

    resolved[key] = overlayDictionary(englishValue, selectedValue);
  }

  return resolved;
}

async function loadRawDictionary<Namespace extends DictionaryNamespace>(
  locale: Locale,
  namespace: Namespace
): Promise<DictionaryByNamespace[Namespace]> {
  const loader = DICTIONARY_LOADERS[locale][namespace] as () => Promise<
    DictionaryModule<Namespace>
  >;
  return (await loader()).default;
}

export async function loadDictionary<
  Namespace extends DictionaryNamespace,
>(
  locale: Locale,
  namespace: Namespace
): Promise<DictionaryByNamespace[Namespace]> {
  if (locale === DEFAULT_LOCALE) {
    return loadRawDictionary(DEFAULT_LOCALE, namespace);
  }

  const [english, selected] = await Promise.all([
    loadRawDictionary(DEFAULT_LOCALE, namespace),
    loadRawDictionary(locale, namespace),
  ]);

  return overlayDictionary(
    english as DictionaryTree,
    selected
  ) as DictionaryByNamespace[Namespace];
}

export async function loadDictionaries<
  const Namespaces extends readonly DictionaryNamespace[],
>(
  locale: Locale,
  namespaces: Namespaces
): Promise<LoadedDictionaries<Namespaces>> {
  const entries = await Promise.all(
    namespaces.map(async (namespace) => [
      namespace,
      await loadDictionary(locale, namespace),
    ])
  );

  return Object.fromEntries(entries) as LoadedDictionaries<Namespaces>;
}

export type LaunchDictionaryValidationIssue = DictionaryValidationIssue & {
  locale: Locale;
  namespace: DictionaryNamespace;
};

export async function validateLaunchDictionaries(): Promise<
  LaunchDictionaryValidationIssue[]
> {
  const issues: LaunchDictionaryValidationIssue[] = [];

  for (const namespace of DICTIONARY_NAMESPACES) {
    const english = await loadRawDictionary(DEFAULT_LOCALE, namespace);

    for (const locale of SUPPORTED_LOCALES) {
      const candidate =
        locale === DEFAULT_LOCALE
          ? english
          : await loadRawDictionary(locale, namespace);

      issues.push(
        ...validateDictionary(english as DictionaryTree, candidate).map(
          (issue) => ({ ...issue, locale, namespace })
        )
      );
    }
  }

  return issues;
}

export async function assertLaunchDictionariesValid(): Promise<void> {
  const issues = await validateLaunchDictionaries();

  if (issues.length === 0) {
    return;
  }

  const detail = issues
    .map(
      (issue) =>
        `${issue.locale}/${issue.namespace} ${issue.code} ${issue.path}: ${issue.detail}`
    )
    .join("\n");

  throw new Error(`Launch dictionary validation failed:\n${detail}`);
}
