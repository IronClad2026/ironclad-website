"use client";

import { ChevronDown, Info } from "lucide-react";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

export default function RegistrationGuidanceDisclosure() {
  const t = useOptionalTranslations("competition", competitionEnglish);

  const stages = [
    {
      title: t("registrationGuidance.adminReviewTitle"),
      body: t("registrationGuidance.adminReviewBody"),
    },
    {
      title: t("registrationGuidance.approvalTitle"),
      body: t("registrationGuidance.approvalBody"),
    },
    {
      title: t("registrationGuidance.divisionReadyTitle"),
      body: t("registrationGuidance.divisionReadyBody"),
    },
    {
      title: t("registrationGuidance.launchTitle"),
      body: t("registrationGuidance.launchBody"),
    },
  ];

  return (
    <details className="group mt-3 w-full max-w-full min-w-0 overflow-hidden border border-orange-300/25 bg-black/55 text-left">
      <summary className="flex min-h-11 w-full min-w-0 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-zinc-200 transition marker:content-none hover:border-orange-400/40 hover:bg-orange-500/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300">
        <span
          aria-hidden="true"
          data-registration-guidance-icon
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-orange-300/55 bg-orange-500/10 text-orange-200 shadow-[0_0_14px_rgba(249,115,22,0.16)]"
        >
          <Info className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 break-words">
          {t("registrationGuidance.controlLabel")}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="min-w-0 border-t border-white/10 px-3 pb-4 pt-3 text-sm text-zinc-300 sm:px-4 sm:pb-5 sm:pt-4">
        <h3 className="break-words text-base font-black text-white">
          {t("registrationGuidance.title")}
        </h3>

        <ol className="mt-4 min-w-0 space-y-3 pl-5 marker:font-black marker:text-orange-400">
          {stages.map((stage) => (
            <li key={stage.title} className="min-w-0 pl-1">
              <h4 className="break-words text-xs font-black uppercase tracking-[0.12em] text-orange-200">
                {stage.title}
              </h4>
              <p className="mt-1 break-words leading-relaxed text-zinc-300">
                {stage.body}
              </p>
            </li>
          ))}
        </ol>

        <section className="mt-4 min-w-0 border border-orange-300/20 bg-orange-500/8 p-3">
          <h4 className="break-words text-xs font-black uppercase tracking-[0.12em] text-orange-200">
            {t("registrationGuidance.matchTimingTitle")}
          </h4>
          <div className="mt-2 min-w-0 space-y-2 leading-relaxed">
            <p className="break-words">
              {t("registrationGuidance.matchTimingBody")}
            </p>
            <p className="break-words">
              {t("registrationGuidance.matchTimingDeadline")}
            </p>
            <p className="break-words">
              {t("registrationGuidance.matchTimingExtension")}
            </p>
          </div>
        </section>

        <div className="mt-4 min-w-0 space-y-2 leading-relaxed text-zinc-200">
          <p className="break-words">
            {t("registrationGuidance.dashboardGuidance")}
          </p>
          <p className="break-words">
            {t("registrationGuidance.bracketGuidance")}
          </p>
        </div>
      </div>
    </details>
  );
}
