"use client";

import { Mail, Swords } from "lucide-react";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type { MatchRoomUnreadItem } from "@/lib/match-room-unread";

export const matchRoomAttentionClass = "outline-2 outline-offset-[3px] outline-amber-400/75 drop-shadow-[0_0_12px_rgba(249,115,22,0.25)]";

export default function MatchRoomAttentionAction({ onClick, unread }: {
  onClick: () => void;
  unread?: MatchRoomUnreadItem;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const label = unread ? t(`matchRoomAttention.${unread.unreadSource}`) : t("tournaments.brackets.openMatch");
  return (
    <button
      type="button"
      data-match-room-action
      onClick={onClick}
      aria-label={unread ? `${label}. ${t("matchRoomAttention.unreadDescription")}` : label}
      title={label}
      className={`mt-2 flex h-12 w-full min-w-0 items-center justify-center gap-2 border px-3 py-2 font-black uppercase transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${unread
        ? "border-amber-300/65 bg-orange-500/20 text-[10px] tracking-[0.08em] text-orange-50"
        : "border-orange-400/45 bg-orange-500/10 text-xs tracking-[0.18em] text-orange-100"}`}
    >
      {unread ? <Mail size={15} className="shrink-0" aria-hidden="true" /> : <Swords size={15} className="shrink-0" aria-hidden="true" />}
      <span className="min-w-0 break-words leading-3">{label}</span>
    </button>
  );
}
