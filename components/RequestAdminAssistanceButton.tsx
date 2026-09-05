"use client";

import { ExternalLink } from "lucide-react";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL } from "@/lib/support";

export default function MatchDiscordSupportLink() {
  const t = useOptionalTranslations("competition", competitionEnglish);
  return (
    <aside className="mb-5 space-y-2 border-b border-white/10 pb-4">
      <a
        href={OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-zinc-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
      >
        {t("resultUx.discord")}
        <ExternalLink size={15} aria-hidden="true" />
      </a>
      <p className="text-xs leading-5 text-zinc-500">
        {t("resultUx.discordHelp")}
      </p>
    </aside>
  );
}
