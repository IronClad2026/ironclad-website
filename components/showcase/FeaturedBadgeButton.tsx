"use client";

import { useState } from "react";
import BadgeArtwork from "@/components/badges/BadgeArtwork";
import { localizeBadgeItem } from "@/components/badges/badgeUi";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import { BADGE_RARITY_TOKENS } from "@/lib/badges/presentation";
import englishAccount from "@/lib/i18n/dictionaries/en/account-dashboard";
import englishBadges from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/badges";
import type { PublicShowcaseBadge } from "@/lib/player-showcase/types";
import { getShowcaseBadgeItem } from "./badge-presentation";

export default function FeaturedBadgeButton({
  badge,
  badgeDictionary = englishBadges,
}: {
  badge: PublicShowcaseBadge;
  badgeDictionary?: BadgesDictionary;
}) {
  const [open, setOpen] = useState(false);
  const t = useOptionalTranslations("account-dashboard", englishAccount);
  const item = getShowcaseBadgeItem(badge);
  if (!item) return null;
  const localized = localizeBadgeItem(item, badgeDictionary);
  const tokens = BADGE_RARITY_TOKENS[localized.definition.rarity];

  return (
    <>
      <button
        type="button"
        aria-label={t("showcase.badgeDetails", { name: localized.definition.name })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="grid size-12 shrink-0 place-items-center rounded-sm border border-white/15 bg-zinc-950 p-1 motion-safe:transition-colors hover:border-orange-300/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:size-14"
        data-featured-achievement
      >
        <BadgeArtwork item={item} variant="featured" dictionary={badgeDictionary} alt="" />
      </button>
      {open ? (
        <ReferenceDialog
          title={localized.definition.name}
          context={badgeDictionary.detail.eyebrow}
          closeLabel={badgeDictionary.detail.close}
          onClose={() => setOpen(false)}
          size="compact"
        >
          <div className="grid items-center gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
            <BadgeArtwork item={item} variant="detail" dictionary={badgeDictionary} className="mx-auto max-w-44" />
            <div className="min-w-0">
              <p className={`inline-flex rounded-sm border px-2.5 py-1 text-xs font-semibold ${tokens.badgeClassName}`}>
                {badgeDictionary.rarity[localized.definition.rarity]}
              </p>
              <h3 className="mt-5 text-xs font-semibold text-zinc-400">{badgeDictionary.detail.unlockMeaning}</h3>
              <p className="mt-2 text-base leading-7 text-zinc-100">{localized.definition.unlockMeaning}</p>
            </div>
          </div>
        </ReferenceDialog>
      ) : null}
    </>
  );
}