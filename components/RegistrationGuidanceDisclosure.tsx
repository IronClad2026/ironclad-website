"use client";

import { ChevronDown, Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

export default function RegistrationGuidanceDisclosure() {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <details className="group mt-3 w-full max-w-full min-w-0 overflow-hidden border border-orange-300/25 bg-black/55 text-left lg:hidden">
        <summary className="flex min-h-11 w-full min-w-0 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-zinc-200 transition marker:content-none hover:border-orange-400/40 hover:bg-orange-500/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300">
          <GuidanceIcon />
          <span className="min-w-0 flex-1 break-words">
            {t("registrationGuidance.controlLabel")}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="min-w-0 border-t border-white/10 px-3 pb-4 pt-3 text-sm text-zinc-300 sm:px-4 sm:pb-5 sm:pt-4">
          <RegistrationGuidanceContent />
        </div>
      </details>

      <div className="mt-3 hidden lg:block">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex min-h-11 w-full min-w-0 items-center gap-2 border border-orange-300/25 bg-black/55 px-3 py-2 text-left text-sm font-bold text-zinc-200 transition hover:border-orange-400/45 hover:bg-orange-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <GuidanceIcon />
          <span className="min-w-0 flex-1 break-words">
            {t("registrationGuidance.controlLabel")}
          </span>
          <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-300" />
        </button>
      </div>

      {dialogOpen ? (
        <RegistrationGuidanceDialog onClose={() => setDialogOpen(false)} />
      ) : null}
    </>
  );
}

function GuidanceIcon() {
  return (
    <span
      aria-hidden="true"
      data-registration-guidance-icon
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-orange-300/55 bg-orange-500/10 text-orange-200 shadow-[0_0_14px_rgba(249,115,22,0.16)]"
    >
      <Info className="h-4 w-4" />
    </span>
  );
}

function RegistrationGuidanceDialog({ onClose }: { onClose: () => void }) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        aria-label={t("tournaments.actions.close")}
        onClick={onClose}
        data-registration-guidance-backdrop
        className="absolute inset-0 h-full w-full cursor-default bg-black/82 backdrop-blur-md"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-3rem)] w-full max-w-2xl min-w-0 overflow-y-auto border border-orange-400/35 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_34%),linear-gradient(145deg,rgba(18,18,18,0.99),rgba(3,3,3,0.99))] p-5 text-sm text-zinc-300 shadow-[0_0_80px_rgba(0,0,0,0.72)] sm:p-7"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t("tournaments.actions.close")}
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center border border-white/12 bg-black/45 text-zinc-400 transition hover:border-orange-400/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <div className="pr-14">
          <RegistrationGuidanceContent titleId={titleId} />
        </div>
      </section>
    </div>,
    document.body
  );
}

function RegistrationGuidanceContent({ titleId }: { titleId?: string }) {
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
    <>
      <h3
        id={titleId}
        className="break-words text-base font-black text-white sm:text-lg"
      >
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
    </>
  );
}
