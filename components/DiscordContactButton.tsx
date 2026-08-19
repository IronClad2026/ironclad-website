"use client";

import { Check, Copy, MessageCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishPublicDictionary from "@/lib/i18n/dictionaries/en/public";

type DiscordContactButtonProps = {
  discordUsername: string | null;
  discordPublicEnabled: boolean;
};

export default function DiscordContactButton({
  discordUsername,
  discordPublicEnabled,
}: DiscordContactButtonProps) {
  const t = useOptionalTranslations("public", englishPublicDictionary);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const canContact = discordPublicEnabled && Boolean(discordUsername?.trim());

  async function copyDiscordUsername() {
    if (!discordUsername) return;

    try {
      await navigator.clipboard.writeText(discordUsername);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  if (!canContact) {
    return (
      <div className="group relative overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-5 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1">
        <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
          <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-zinc-400">
            <ShieldAlert size={18} />
            <p className="text-sm font-bold">
              {t("players.discordUnavailable")}
            </p>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {t("players.discordUnavailableText")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden border border-sky-400/25 bg-[linear-gradient(145deg,rgba(14,165,233,0.12),rgba(8,8,8,0.86))] p-5 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1">
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-sky-300/55" />
      </div>
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-sky-200">
            <MessageCircle size={18} />
            {t("players.discordContact")}
          </p>
          <p className="mt-2 text-xs leading-5 text-sky-100/75">
            {t("players.discordOptedIn")}
          </p>
        </div>

        <button
          type="button"
          onClick={copyDiscordUsername}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300/35 bg-sky-400/15 px-4 py-3 text-sm font-black text-sky-100 transition hover:border-sky-200/70 hover:bg-sky-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
        >
          {status === "copied" ? <Check size={17} /> : <Copy size={17} />}
          {t("players.contactPlayer")}
        </button>
      </div>

      {status !== "idle" && (
        <div className="relative z-10 mt-4 border border-white/12 bg-black/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
            {t("players.discordUsername")}
          </p>
          <p className="mt-1 break-words font-bold text-white">
            {discordUsername}
          </p>
          <p className="mt-2 text-xs text-sky-100/70">
            {status === "copied"
              ? t("players.copied")
              : t("players.copyFailed")}
          </p>
        </div>
      )}
    </div>
  );
}
