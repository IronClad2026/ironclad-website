"use client";

import { Eye, EyeOff, ShieldCheck, UserRound } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updatePublicProfileEnabled,
  type PublicProfileVisibilityActionResult,
} from "@/app/dashboard/public-profile-actions";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishAccountDictionary from "@/lib/i18n/dictionaries/en/account-dashboard";

const resultKeys: Record<
  PublicProfileVisibilityActionResult["code"],
  string
> = {
  "sign-in-required": "visibility.signInProfile",
  "invalid-value": "visibility.invalidProfile",
  "update-failed": "visibility.profileUpdateFailed",
  "profile-required": "visibility.profileRequired",
  "verification-failed": "visibility.profileVerifyFailed",
  enabled: "visibility.profileNowPublic",
  disabled: "visibility.profileNowPrivate",
};

type PublicProfileVisibilityCardProps = {
  initialEnabled: boolean;
};

export default function PublicProfileVisibilityCard({
  initialEnabled,
}: PublicProfileVisibilityCardProps) {
  const t = useOptionalTranslations(
    "account-dashboard",
    englishAccountDictionary
  );
  const [enabled, setEnabled] = useState(initialEnabled);
  const [feedback, setFeedback] = useState<{
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggleVisibility = () => {
    if (pending) return;

    const nextEnabled = !enabled;
    setFeedback(null);

    startTransition(async () => {
      const result = await updatePublicProfileEnabled(nextEnabled);

      if (result.status === "success") {
        setEnabled(result.enabled);
        router.refresh();
      }

      const resultKey = resultKeys[result.code];
      setFeedback({
        message: resultKey ? t(resultKey) : result.message,
        status: result.status,
      });
    });
  };

  return (
    <section
      className="min-w-0 border border-white/12 bg-zinc-950/85 p-4 sm:p-5"
      data-profile-visibility-control="public-profile"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center border border-white/10 bg-white/5 text-zinc-300">
          <UserRound size={17} />
        </span>
        <p className="min-w-0 flex-1 text-base font-semibold text-white">
          {t("visibility.publicTitle")}
        </p>
        <span
          className={`shrink-0 rounded-sm border px-2.5 py-1 text-xs font-semibold ${
            enabled
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-300"
              : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
          }`}
        >
          {enabled ? t("visibility.public") : t("visibility.private")}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-zinc-400">
        {t("visibility.publicDescription")}
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={toggleVisibility}
        className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 border border-white/10 bg-black/35 p-2 text-left transition hover:border-orange-400/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-wait disabled:opacity-70"
      >
        <span className="flex min-w-0 items-center gap-2 px-1.5 text-xs font-bold text-zinc-200 sm:text-sm">
          {enabled ? (
            <Eye size={17} className="text-emerald-300" />
          ) : (
            <EyeOff size={17} className="text-zinc-500" />
          )}
          {pending
            ? t("visibility.updating")
            : enabled
              ? t("visibility.makePrivate")
              : t("visibility.makePublic")}
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

      {feedback && (
        <p
          aria-live="polite"
          className={`mt-3 flex items-start gap-2 text-xs leading-5 ${
            feedback.status === "success" ? "text-emerald-300" : "text-red-300"
          }`}
        >
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          {feedback.message}
        </p>
      )}
    </section>
  );
}
