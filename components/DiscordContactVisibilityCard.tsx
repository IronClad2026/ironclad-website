"use client";

import { Eye, EyeOff, MessageCircle, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateDiscordPublicEnabled,
  type DiscordVisibilityActionResult,
} from "@/app/dashboard/actions";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishAccountDictionary from "@/lib/i18n/dictionaries/en/account-dashboard";

const resultKeys: Record<DiscordVisibilityActionResult["code"], string> = {
  "sign-in-required": "visibility.signInDiscord",
  "invalid-value": "visibility.invalidDiscord",
  "update-failed": "visibility.discordUpdateFailed",
  "profile-required": "visibility.profileRequired",
  "username-required": "visibility.discordUsernameRequired",
  enabled: "visibility.discordNowPublic",
  disabled: "visibility.discordNowPrivate",
};

type DiscordContactVisibilityCardProps = {
  initialEnabled: boolean;
  hasDiscordUsername: boolean;
};

export default function DiscordContactVisibilityCard({
  initialEnabled,
  hasDiscordUsername,
}: DiscordContactVisibilityCardProps) {
  const t = useOptionalTranslations(
    "account-dashboard",
    englishAccountDictionary
  );
  const [enabled, setEnabled] = useState(initialEnabled && hasDiscordUsername);
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState<
    "success" | "error" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggleVisibility = () => {
    if (pending || !hasDiscordUsername) return;

    const nextEnabled = !enabled;
    setMessage("");
    setMessageStatus(null);

    startTransition(async () => {
      const result = await updateDiscordPublicEnabled(nextEnabled);

      if (result.status === "success") {
        setEnabled(result.enabled);
        const resultKey = resultKeys[result.code];
        setMessage(resultKey ? t(resultKey) : result.message);
        setMessageStatus(result.status);
        router.refresh();
        return;
      }

      setEnabled(result.enabled);
      const resultKey = resultKeys[result.code];
      setMessage(resultKey ? t(resultKey) : result.message);
      setMessageStatus(result.status);
    });
  };

  return (
    <section
      className="min-w-0 border border-white/12 bg-black/50 p-4 shadow-xl shadow-black/20 backdrop-blur"
      data-profile-visibility-control="discord"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
          <MessageCircle size={17} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-black uppercase tracking-[0.15em] text-white">
          {t("visibility.discordTitle")}
        </p>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
            enabled
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-300"
              : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
          }`}
        >
          {enabled ? t("visibility.enabled") : t("visibility.disabled")}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-zinc-400">
        {t("visibility.discordDescription")}
      </p>

      {!hasDiscordUsername && (
        <div className="mt-3 border border-amber-400/20 bg-amber-500/10 p-2.5 text-xs leading-5 text-amber-100/80">
          {t("visibility.discordMissing")}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending || !hasDiscordUsername}
        onClick={toggleVisibility}
        className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 border border-white/10 bg-black/45 p-2 text-left transition hover:border-orange-400/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="flex min-w-0 items-center gap-2 px-1.5 text-xs font-bold text-zinc-200 sm:text-sm">
          {enabled ? (
            <Eye size={17} className="text-emerald-300" />
          ) : (
            <EyeOff size={17} className="text-zinc-500" />
          )}
          {pending
            ? t("visibility.updating")
            : !hasDiscordUsername
              ? t("visibility.addDiscord")
              : enabled
                ? t("visibility.turnOff")
                : t("visibility.turnOn")}
        </span>

        <span
          className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
            enabled
              ? "border-emerald-400/45 bg-emerald-500/25"
              : "border-white/10 bg-zinc-800"
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-lg transition ${
              enabled ? "left-6" : "left-1"
            }`}
          />
        </span>
      </button>

      {message && (
        <p
          aria-live="polite"
          className={`mt-3 flex items-start gap-2 text-xs leading-5 ${
            messageStatus === "error"
              ? "text-red-300"
              : "text-emerald-300"
          }`}
        >
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}
    </section>
  );
}
