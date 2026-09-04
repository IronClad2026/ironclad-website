"use client";

import { Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import useHydrationSafeNow from "@/components/useHydrationSafeNow";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { toIntlLocale } from "@/lib/i18n/config";
import { getConfirmationTiming } from "@/lib/match-result-entry";

export default function MatchConfirmationCountdown({
  deadlineAt,
  createdAt,
  isSubmitter,
}: {
  deadlineAt: string | null;
  createdAt: string | null;
  isSubmitter: boolean;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const locale = useOptionalLocale();
  const router = useRouter();
  const now = useHydrationSafeNow();
  const { deadline, windowMinutes } = getConfirmationTiming(
    deadlineAt,
    createdAt
  );
  const expired = deadline !== null && now !== null && now >= deadline;
  const lastRefresh = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const time = Date.now();
      if (
        document.visibilityState !== "hidden" &&
        time - lastRefresh.current >= 10_000
      ) {
        lastRefresh.current = time;
        router.refresh();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // Refresh only authoritative reads. A browser never approves a result.
    if (expired) refresh();
    const interval = expired ? window.setInterval(refresh, 15_000) : null;
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (interval !== null) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [expired, router, deadlineAt]);

  const seconds =
    deadline !== null && now !== null
      ? Math.max(0, Math.ceil((deadline - now) / 1000))
      : null;
  const number = new Intl.NumberFormat(toIntlLocale(locale));
  return (
    <div className="space-y-2 rounded-xl border border-orange-400/25 bg-orange-500/5 p-4 text-sm leading-6 text-zinc-300">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-200">
        <Info size={16} aria-hidden="true" />
        {t("resultUx.confirmationInfo")}
      </p>
      <div role="status" aria-live="polite">
        {expired ? (
          <>
            <p className="font-bold text-white">{t("resultUx.windowEnded")}</p>
            <p>{t("resultUx.processing")}</p>
          </>
        ) : (
          <>
            <p>
              {windowMinutes !== null
                ? t(
                    isSubmitter
                      ? "resultUx.opponentWindow"
                      : "resultUx.yourWindow",
                    { minutes: number.format(windowMinutes) }
                  )
                : t("resultUx.confirmationExplanation")}
            </p>
            <p>{t("resultUx.autoExplanation")}</p>
          </>
        )}
      </div>
      {!expired && (
        <p className="font-bold tabular-nums text-white" aria-live="off">
          {seconds === null
            ? t("deadlines.unavailable")
            : t("resultUx.remaining", {
                minutes: number.format(Math.floor(seconds / 60)),
                seconds: number.format(seconds % 60),
              })}
        </p>
      )}
      <p className="text-xs text-zinc-400">
        {t("resultUx.confirmationDeadline")}{" "}
        <HydrationSafeLocalDateTime
          value={deadlineAt}
          fallback={t("deadlines.unavailable")}
          locale={locale}
          options={{ dateStyle: "medium", timeStyle: "short" }}
        />
      </p>
    </div>
  );
}
