"use client";

import { Check } from "lucide-react";
import BadgeArtwork from "@/components/badges/BadgeArtwork";
import { localizeBadgeItem } from "@/components/badges/badgeUi";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import englishAccount from "@/lib/i18n/dictionaries/en/account-dashboard";
import type { BadgesDictionary } from "@/lib/i18n/badges";
import type { OwnedShowcaseBadge } from "@/lib/player-showcase/types";
import { getShowcaseBadgeItem } from "./badge-presentation";

export default function FeaturedBadgePicker({
  awards, selectedAwardId, pending, badgeDictionary, onSelect, onClose, error,
}: {
  awards: OwnedShowcaseBadge[];
  selectedAwardId: string | null;
  pending: boolean;
  error?: string | null;
  badgeDictionary: BadgesDictionary;
  onSelect: (awardId: string) => void;
  onClose: () => void;
}) {
  const t = useOptionalTranslations("account-dashboard", englishAccount);

  return (
    <ReferenceDialog title={t("showcase.pickerTitle")} context={t("showcase.title")} closeLabel={t("showcase.close")} onClose={onClose} size="compact">
      <p className="text-sm leading-6 text-zinc-400">{t("showcase.pickerHelp")}</p>
      {error ? <p role="status" className="mt-3 text-sm leading-6 text-red-300">{error}</p> : null}
      <ul className="mt-5 grid gap-2" aria-busy={pending}>
        {awards.map((award) => {
          const item = getShowcaseBadgeItem(award);
          if (!item) return null;
          const localized = localizeBadgeItem(item, badgeDictionary);
          const selected = selectedAwardId === award.awardId;
          return (
            <li key={award.awardId}>
              <button
                type="button"
                disabled={pending}
                aria-pressed={selected}
                aria-label={t("showcase.selectBadge", { name: localized.definition.name })}
                onClick={() => onSelect(award.awardId)}
                className={`flex min-h-20 w-full items-center gap-3 border p-3 text-left motion-safe:transition-colors hover:border-orange-300/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60 ${selected ? "border-orange-300/40 bg-orange-300/[0.04]" : "border-white/10 bg-white/[0.02]"}`}
              >
                <BadgeArtwork item={item} variant="featured" dictionary={badgeDictionary} alt="" className="max-w-12 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-zinc-100">{localized.definition.name}</span>
                  <span className="mt-1 block text-xs text-zinc-400">
                    {badgeDictionary.rarity[localized.definition.rarity]}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-zinc-300">{localized.definition.unlockMeaning}</span>
                </span>
                {selected ? <Check size={18} className="shrink-0 text-orange-300" aria-hidden="true" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </ReferenceDialog>
  );
}