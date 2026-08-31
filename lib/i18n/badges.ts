import englishBadges from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

export type { BadgesDictionary };

export const DEFAULT_BADGES_DICTIONARY: BadgesDictionary = englishBadges;

export type LocalizedBadgeSlug = keyof BadgesDictionary["definitions"];

const BADGE_SLUG_SET = new Set<string>(
  Object.keys(DEFAULT_BADGES_DICTIONARY.definitions)
);

export function isLocalizedBadgeSlug(
  value: unknown
): value is LocalizedBadgeSlug {
  return typeof value === "string" && BADGE_SLUG_SET.has(value);
}

export function getLocalizedBadgeDefinition(
  dictionary: BadgesDictionary,
  badgeSlug: unknown
) {
  return isLocalizedBadgeSlug(badgeSlug)
    ? dictionary.definitions[badgeSlug]
    : null;
}
