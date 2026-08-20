"use client";

import { BarChart3, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";
import {
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsentDecision,
} from "@/lib/analytics-consent";

type AnalyticsConsentCopy = CommonDictionary["analyticsConsent"];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function AnalyticsConsent({
  copy,
}: {
  copy: AnalyticsConsentCopy;
}) {
  const decision = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    () => null
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const choicesTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const grantRef = useRef<HTMLButtonElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  const bannerTitleId = useId();
  const bannerDescriptionId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();

  useEffect(() => {
    if (!preferencesOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      if (decision === "declined") {
        declineRef.current?.focus();
      } else {
        grantRef.current?.focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreferencesOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          []
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);

      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) {
        window.setTimeout(() => returnTarget.focus({ preventScroll: true }), 0);
      }
    };
  }, [decision, preferencesOpen]);

  const openPreferences = () => {
    returnFocusRef.current = choicesTriggerRef.current;
    setSaveError(null);
    setPreferencesOpen(true);
  };

  const saveDecision = (nextDecision: AnalyticsConsentDecision) => {
    setSaveError(null);

    if (!writeAnalyticsConsent(nextDecision)) {
      setSaveError(copy.saveError);
      setAnnouncement(copy.saveError);
      return;
    }

    setAnnouncement(
      nextDecision === "granted" ? copy.savedGranted : copy.savedDeclined
    );

    if (preferencesOpen) {
      setPreferencesOpen(false);
      return;
    }

    window.setTimeout(
      () => choicesTriggerRef.current?.focus({ preventScroll: true }),
      0
    );
  };

  const status =
    decision === "granted"
      ? copy.statusGranted
      : decision === "declined"
        ? copy.statusDeclined
        : copy.statusUndecided;
  const showBanner = decision === null && !preferencesOpen;
  const canUsePortal = typeof document !== "undefined";

  return (
    <>
      <button
        ref={choicesTriggerRef}
        type="button"
        className="min-h-11 text-left transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        onClick={openPreferences}
      >
        {copy.choices}
      </button>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {canUsePortal && showBanner
        ? createPortal(
            <section
              role="region"
              aria-labelledby={bannerTitleId}
              aria-describedby={bannerDescriptionId}
              className="fixed inset-x-0 bottom-0 z-[140] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5"
            >
              <div className="mx-auto max-h-[min(82dvh,42rem)] max-w-5xl overflow-y-auto rounded-2xl border border-orange-400/35 bg-[linear-gradient(145deg,rgba(24,24,27,0.99),rgba(9,9,11,0.99))] p-4 text-white shadow-[0_0_70px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:p-6">
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
                    <BarChart3 aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                      {copy.label}
                    </p>
                    <h2
                      id={bannerTitleId}
                      className="mt-1 text-xl font-black text-white sm:text-2xl"
                    >
                      {copy.title}
                    </h2>
                    <p
                      id={bannerDescriptionId}
                      className="mt-2 text-sm leading-6 text-zinc-300"
                    >
                      {copy.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-xs leading-5 text-zinc-400 lg:grid-cols-2">
                  <p>{copy.details}</p>
                  <p>{copy.required}</p>
                </div>

                {saveError ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100"
                  >
                    {saveError}
                  </p>
                ) : null}

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr] lg:items-center">
                  <button
                    type="button"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-orange-400 bg-orange-500/10 px-5 py-3 text-sm font-black text-orange-100 transition hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 lg:w-auto"
                    onClick={() => saveDecision("granted")}
                  >
                    {copy.allow}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-orange-400 bg-orange-500/10 px-5 py-3 text-sm font-black text-orange-100 transition hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 lg:w-auto"
                    onClick={() => saveDecision("declined")}
                  >
                    {copy.decline}
                  </button>
                  <Link
                    href="/privacy"
                    className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-zinc-300 underline decoration-zinc-600 underline-offset-4 transition hover:text-orange-200 lg:justify-end"
                  >
                    {copy.privacyLink}
                  </Link>
                </div>
              </div>
            </section>,
            document.body
          )
        : null}

      {canUsePortal && preferencesOpen
        ? createPortal(
            <div
              data-testid="analytics-consent-backdrop"
              className="fixed inset-0 z-[150] flex min-h-[100dvh] items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                  setPreferencesOpen(false);
                }
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                tabIndex={-1}
                className="max-h-[min(92dvh,46rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(24,24,27,0.99),rgba(9,9,11,0.99))] px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-[0_0_80px_rgba(0,0,0,0.88)] sm:rounded-2xl sm:p-6"
              >
                <div
                  aria-hidden="true"
                  className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-700 sm:hidden"
                />

                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                      {copy.label}
                    </p>
                    <h2
                      id={dialogTitleId}
                      className="mt-1 break-words text-2xl font-black text-white"
                    >
                      {copy.dialogTitle}
                    </h2>
                    <p
                      id={dialogDescriptionId}
                      className="mt-2 text-sm leading-6 text-zinc-400"
                    >
                      {copy.dialogDescription}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={copy.close}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-zinc-300 transition hover:border-orange-400/45 hover:bg-orange-400/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                    onClick={() => setPreferencesOpen(false)}
                  >
                    <X aria-hidden="true" className="size-5" />
                  </button>
                </div>

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-orange-300"
                  />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                      {copy.currentChoice}
                    </p>
                    <p className="mt-1 font-black text-white">{status}</p>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-6 text-zinc-300">
                  {copy.details}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {copy.required}
                </p>

                {saveError ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100"
                  >
                    {saveError}
                  </p>
                ) : null}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    ref={grantRef}
                    type="button"
                    aria-pressed={decision === "granted"}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-orange-400 bg-orange-500/10 px-5 py-3 text-sm font-black text-orange-100 transition hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                    onClick={() => saveDecision("granted")}
                  >
                    {copy.allow}
                  </button>
                  <button
                    ref={declineRef}
                    type="button"
                    aria-pressed={decision === "declined"}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-orange-400 bg-orange-500/10 px-5 py-3 text-sm font-black text-orange-100 transition hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                    onClick={() => saveDecision("declined")}
                  >
                    {decision === "granted" ? copy.withdraw : copy.decline}
                  </button>
                </div>

                <Link
                  href="/privacy"
                  onClick={() => setPreferencesOpen(false)}
                  className="mt-4 inline-flex min-h-11 items-center font-bold text-zinc-300 underline decoration-zinc-600 underline-offset-4 transition hover:text-orange-200"
                >
                  {copy.privacyLink}
                </Link>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
