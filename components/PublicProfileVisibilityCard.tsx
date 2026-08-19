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
    <section className="rounded-2xl border border-orange-500/25 bg-[linear-gradient(135deg,rgba(249,115,22,0.09),rgba(255,255,255,0.03))] p-5 shadow-xl shadow-black/20 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
          <UserRound size={20} />
        </span>

        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
            enabled
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-300"
              : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
          }`}
        >
          {enabled ? t("visibility.public") : t("visibility.private")}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-white">
          {t("visibility.publicTitle")}
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {t("visibility.publicDescription")}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={toggleVisibility}
        className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-2 text-left transition hover:border-orange-400/35 disabled:cursor-wait disabled:opacity-70"
      >
        <span className="flex items-center gap-3 px-2 text-sm font-bold text-zinc-200">
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
          className={`relative h-8 w-14 rounded-full border transition ${
            enabled
              ? "border-emerald-400/45 bg-emerald-500/25"
              : "border-white/10 bg-zinc-800"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-lg transition ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </span>
      </button>

      {feedback && (
        <p
          aria-live="polite"
          className={`mt-4 flex items-start gap-2 text-xs leading-5 ${
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
