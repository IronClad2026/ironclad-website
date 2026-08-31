import type { BadgeCollectionItem, BadgeRarity } from "@/lib/badges/types";
import {
  DEFAULT_BADGES_DICTIONARY,
  getLocalizedBadgeDefinition,
  type BadgesDictionary,
} from "@/lib/i18n/badges";

export function resolveBadgesDictionary(
  dictionary?: BadgesDictionary
): BadgesDictionary {
  return dictionary ?? DEFAULT_BADGES_DICTIONARY;
}

export function localizeBadgeItem<T extends BadgeCollectionItem>(
  item: T,
  dictionary: BadgesDictionary
): T {
  const localizedDefinition = getLocalizedBadgeDefinition(
    dictionary,
    item.definition.slug
  );

  if (!localizedDefinition) return item;

  return {
    ...item,
    definition: {
      ...item.definition,
      name: localizedDefinition.name,
      unlockMeaning: localizedDefinition.unlockMeaning,
    },
  } as T;
}

export function getLocalizedRarity(
  dictionary: BadgesDictionary,
  rarity: BadgeRarity
) {
  return dictionary.rarity[rarity];
}

export function interpolateBadgeCopy(
  template: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (copy, [key, value]) => copy.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function retryBadgeLoad(onRetry?: () => void) {
  if (onRetry) {
    onRetry();
    return;
  }

  window.location.reload();
}
