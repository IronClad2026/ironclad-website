"use client";

import { useState } from "react";
import { requestMatchAdminAssistance } from "@/app/tournaments/support-actions";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

export default function RequestAdminAssistanceButton({
  matchId,
}: {
  matchId: string;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof requestMatchAdminAssistance>
  > | null>(null);

  const requestAssistance = async () => {
    setIsSubmitting(true);
    setResult(null);

    try {
      setResult(await requestMatchAdminAssistance({ matchId }));
    } catch {
      setResult({
        success: false,
        code: "request_failed",
        message: t("support.error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mb-6 border border-orange-500/30 bg-orange-500/10 p-4">
      <p className="text-sm leading-6 text-zinc-200">
        {t("support.description")}
      </p>
      <button
        type="button"
        onClick={requestAssistance}
        disabled={isSubmitting || result?.success === true}
        className="mt-3 rounded border border-orange-400/60 px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-200 transition hover:border-orange-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? t("support.requesting") : t("support.action")}
      </button>
      {result && (
        <p
          role="status"
          className={
            result.success
              ? "mt-3 text-sm font-bold text-emerald-300"
              : "mt-3 text-sm font-bold text-orange-300"
          }
        >
          {result.code === "requested"
            ? t("actionResults.assistanceRequested")
            : result.code === "unavailable"
              ? t("actionResults.assistanceUnavailable")
              : result.code === "participant_only"
                ? t("actionResults.assistanceParticipantOnly")
                : result.code === "auth_required"
                  ? t("actionResults.authRequired")
                  : t("support.error")}
        </p>
      )}
    </div>
  );
}
