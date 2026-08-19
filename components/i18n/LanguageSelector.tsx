"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Globe2, X } from "lucide-react";

import type { SetLocalePreferenceResult } from "@/app/locale-actions";
import { LOCALE_OPTIONS, type Locale } from "@/lib/i18n/config";

export type LanguageSelectorCopy = {
  triggerAriaLabel: string;
  languageRowLabel: string;
  title: string;
  description: string;
  closeLabel: string;
  selectedLabel: string;
  savingLabel: string;
  saveError: string;
  translationReviewNotice: string;
  privacyHeading: string;
  privacyCookie: string;
  privacyClerk: string;
  privacyNoTracking: string;
  privacyNotEvidence: string;
  privacyChange: string;
  privacyPolicyLink: string;
};

export type SetLocalePreferenceAction = (
  locale: string
) => Promise<SetLocalePreferenceResult>;

type LanguageSelectorTriggerProps = {
  currentLocale: Locale;
  copy: Pick<
    LanguageSelectorCopy,
    "triggerAriaLabel" | "languageRowLabel"
  >;
  open: boolean;
  variant: "desktop" | "mobile";
  onOpen: (trigger: HTMLButtonElement) => void;
};

export const LanguageSelectorTrigger = forwardRef<
  HTMLButtonElement,
  LanguageSelectorTriggerProps
>(function LanguageSelectorTrigger(
  { currentLocale, copy, onOpen, open, variant },
  forwardedRef
) {
  const selectedLocale =
    LOCALE_OPTIONS.find((option) => option.id === currentLocale) ??
    LOCALE_OPTIONS[0];

  if (variant === "mobile") {
    return (
      <button
        ref={forwardedRef}
        type="button"
        aria-controls="ironclad-language-selector"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={copy.triggerAriaLabel}
        className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-zinc-200 transition hover:border-orange-400/40 hover:bg-orange-400/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className="flex items-center gap-3">
          <Globe2
            aria-hidden="true"
            className="size-4 shrink-0 text-orange-300"
          />
          <span>{copy.languageRowLabel}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-400">
          <span className="font-semibold tracking-[0.08em] text-orange-300">
            {selectedLocale.code}
          </span>
          <span
            className="truncate normal-case tracking-normal"
            lang={selectedLocale.id}
          >
            {selectedLocale.label}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      ref={forwardedRef}
      type="button"
      aria-controls="ironclad-language-selector"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={copy.triggerAriaLabel}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-orange-400/45 hover:bg-orange-400/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Globe2 aria-hidden="true" className="size-4 text-orange-300" />
      <span className="tracking-[0.08em] text-orange-200">
        {selectedLocale.code}
      </span>
      <span
        className="hidden max-w-28 truncate normal-case tracking-normal 2xl:inline"
        lang={selectedLocale.id}
      >
        {selectedLocale.label}
      </span>
    </button>
  );
});

type LanguageSelectorProps = {
  open: boolean;
  currentLocale: Locale;
  copy: LanguageSelectorCopy;
  setLocalePreference: SetLocalePreferenceAction;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  privacyPolicyHref?: string;
  languageBoundary?: string;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[role="radio"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function LanguageSelector({
  open,
  currentLocale,
  copy,
  setLocalePreference,
  onOpenChange,
  returnFocusRef,
  privacyPolicyHref = "/privacy",
  languageBoundary,
}: LanguageSelectorProps) {
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentLocaleRef = useRef<HTMLButtonElement>(null);
  const capturedFocusRef = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const titleId = useId();
  const descriptionId = useId();
  const translationReviewId = useId();
  const privacyId = useId();

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const explicitReturnTarget = returnFocusRef?.current;
    const activeElement = document.activeElement;
    capturedFocusRef.current =
      explicitReturnTarget ??
      (activeElement instanceof HTMLElement ? activeElement : null);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      currentLocaleRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
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

      const returnTarget = capturedFocusRef.current;
      if (returnTarget?.isConnected) {
        returnTarget.focus();
      }
    };
  }, [open, returnFocusRef]);

  const close = () => {
    if (pendingLocale) {
      return;
    }

    setSaveError(null);
    onOpenChange(false);
  };

  const selectLocale = async (locale: Locale) => {
    if (pendingLocale) {
      return;
    }

    if (locale === currentLocale) {
      close();
      return;
    }

    setPendingLocale(locale);
    setSaveError(null);

    try {
      const result = await setLocalePreference(locale);
      if (!result.ok) {
        setSaveError(copy.saveError);
        return;
      }

      onOpenChange(false);
    } catch {
      console.error("Failed to save the IronClad locale preference.");
      setSaveError(copy.saveError);
    } finally {
      setPendingLocale(null);
    }
  };

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      data-testid="language-selector-backdrop"
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        ref={dialogRef}
        id="ironclad-language-selector"
        lang={languageBoundary}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${translationReviewId} ${privacyId}`}
        tabIndex={-1}
        className="max-h-[min(92dvh,54rem)] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(24,24,27,0.99),rgba(9,9,11,0.99))] px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-[0_0_80px_rgba(0,0,0,0.85)] sm:rounded-2xl sm:p-6"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-700 sm:hidden"
        />

        <div className="flex items-start justify-between gap-5 border-b border-white/10 pb-4">
          <div>
            <p className="mb-1 text-[10px] font-bold tracking-[0.24em] text-orange-300 uppercase">
              IronClad
            </p>
            <h2
              id={titleId}
              className="text-xl font-black normal-case tracking-normal text-white sm:text-2xl"
            >
              {copy.title}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-zinc-400">
              {copy.description}
            </p>
          </div>

          <button
            type="button"
            aria-label={copy.closeLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-zinc-300 transition hover:border-orange-400/45 hover:bg-orange-400/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-wait disabled:opacity-45"
            disabled={pendingLocale !== null}
            onClick={close}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label={copy.title}
          className="mt-5 grid grid-cols-1 gap-2.5 min-[350px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {LOCALE_OPTIONS.map((option) => {
            const selected = option.id === currentLocale;
            const pending = option.id === pendingLocale;

            return (
              <button
                key={option.id}
                ref={selected ? currentLocaleRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-describedby={selected ? privacyId : undefined}
                disabled={pendingLocale !== null}
                className={`group relative flex min-h-14 min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-wait disabled:opacity-60 ${
                  selected
                    ? "border-orange-400/75 bg-orange-400/[0.13] shadow-[inset_0_0_0_1px_rgba(251,146,60,0.12)]"
                    : "border-white/10 bg-black/25 hover:border-zinc-500 hover:bg-white/[0.055]"
                }`}
                onClick={() => void selectLocale(option.id)}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-lg"
                >
                  {option.indicator}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold tracking-[0.12em] text-orange-300">
                    {option.code}
                  </span>
                  <span
                    lang={option.id}
                    className="block break-words text-sm font-semibold normal-case leading-tight tracking-normal text-zinc-100"
                  >
                    {pending ? copy.savingLabel : option.label}
                  </span>
                </span>
                {selected && (
                  <span className="sr-only">{copy.selectedLabel}</span>
                )}
                {selected && (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-orange-300"
                  />
                )}
              </button>
            );
          })}
        </div>

        <p
          id={translationReviewId}
          lang={languageBoundary ?? currentLocale}
          className="mt-4 border-t border-white/[0.07] pt-3 text-[11px] leading-relaxed text-zinc-400 sm:text-xs"
        >
          {copy.translationReviewNotice}
        </p>

        {saveError && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {saveError}
          </p>
        )}

        <aside
          id={privacyId}
          className="mt-5 rounded-xl border border-sky-300/15 bg-sky-300/[0.045] px-4 py-3 text-xs leading-relaxed text-zinc-400"
        >
          <p className="font-bold text-zinc-200">{copy.privacyHeading}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 marker:text-orange-300">
            <li>{copy.privacyCookie}</li>
            <li>{copy.privacyClerk}</li>
            <li>{copy.privacyNoTracking}</li>
            <li>{copy.privacyNotEvidence}</li>
            <li>{copy.privacyChange}</li>
          </ul>
          <Link
            href={privacyPolicyHref}
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-orange-300 underline decoration-orange-300/40 underline-offset-4 transition hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            onClick={() => onOpenChange(false)}
          >
            {copy.privacyPolicyLink}
          </Link>
        </aside>
      </div>
    </div>,
    document.body
  );
}
