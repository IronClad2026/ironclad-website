"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { Locale } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/translate";
import type {
  DictionaryTree,
  MessageValues,
} from "@/lib/i18n/types";

export type ClientDictionaries = Readonly<Record<string, DictionaryTree>>;

type LocaleContextValue = {
  locale: Locale;
  dictionaries: ClientDictionaries;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const EMPTY_DICTIONARY: DictionaryTree = {};

type LocaleProviderProps = {
  children: ReactNode;
  locale: Locale;
  dictionaries: ClientDictionaries;
};

export default function LocaleProvider({
  children,
  locale,
  dictionaries,
}: LocaleProviderProps) {
  const parent = useContext(LocaleContext);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dictionaries: {
        ...(parent?.dictionaries ?? {}),
        ...dictionaries,
      },
    }),
    [dictionaries, locale, parent?.dictionaries]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider.");
  }

  return context.locale;
}

export function useOptionalLocale(fallback: Locale = "en"): Locale {
  return useContext(LocaleContext)?.locale ?? fallback;
}

export function useTranslations(namespace: string) {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useTranslations must be used inside LocaleProvider.");
  }

  const dictionary =
    context.dictionaries[namespace] ?? EMPTY_DICTIONARY;

  return useCallback(
    (path: string, values?: MessageValues) =>
      translate(dictionary, path, values),
    [dictionary]
  );
}


export function useOptionalTranslations(
  namespace: string,
  fallbackDictionary: DictionaryTree
) {
  const context = useContext(LocaleContext);
  const dictionary = useMemo(
    () => context?.dictionaries[namespace] ?? fallbackDictionary,
    [context?.dictionaries, fallbackDictionary, namespace]
  );

  return useCallback(
    (path: string, values?: MessageValues) =>
      translate(dictionary, path, values),
    [dictionary]
  );
}
