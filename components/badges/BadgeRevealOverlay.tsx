"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  BADGE_RARITY_TOKENS,
  getBadgeRarityLabel,
} from "@/lib/badges/presentation";
import type {
  BadgePresentationEntitlement,
  EarnedBadgeCollectionItem,
} from "@/lib/badges/types";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeRevealOverlayProps = {
  item: EarnedBadgeCollectionItem;
  open?: boolean;
  entitlement?: BadgePresentationEntitlement;
  reason?: "new-unlock" | "retroactive-premium";
  onClose?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  pending?: boolean;
  errorMessage?: string | null;
  queuePosition?: { current: number; total: number };
  reducedMotion?: boolean;
};

export default function BadgeRevealOverlay({
  item,
  open = true,
  entitlement = defaultEntitlement,
  reason = "new-unlock",
  onClose,
  onContinue,
  continueLabel = "Continue",
  pending = false,
  errorMessage = null,
  queuePosition,
  reducedMotion,
}: BadgeRevealOverlayProps) {
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(pending);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? Boolean(prefersReducedMotion);
  const premium = entitlement.premiumEffectsEnabled;
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const portalTarget =
    typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const activeElement = document.activeElement;
    previouslyFocusedElementRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    document.body.style.overflow = "hidden";

    const overlayRoot = overlayRootRef.current;
    const backgroundElements = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== overlayRoot
      )
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));

    for (const { element } of backgroundElements) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !pendingRef.current &&
        onCloseRef.current
      ) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const focusedElement = document.activeElement;

      if (focusableElements.length === 1) {
        event.preventDefault();
        firstFocusable.focus();
      } else if (
        event.shiftKey &&
        (focusedElement === firstFocusable || !dialog.contains(focusedElement))
      ) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (
        !event.shiftKey &&
        (focusedElement === lastFocusable || !dialog.contains(focusedElement))
      ) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeyDown);

      for (const { element, inert, ariaHidden } of backgroundElements) {
        element.inert = inert;
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
      }

      restoreFocus(previouslyFocusedElementRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const initialFocusTarget =
        continueButtonRef.current ??
        getFocusableElements(dialogRef.current)[0] ??
        dialogRef.current;
      initialFocusTarget?.focus();
    }
  }, [open, item.award.awardId]);

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          ref={overlayRootRef}
          className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6"
          data-motion={shouldReduceMotion ? "reduced" : "animated"}
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 h-full w-full cursor-default bg-black/82 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-[-20%] top-[18%] h-72 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.16),rgba(24,24,27,0.08)_42%,transparent_72%)] blur-3xl"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-[-10%] left-[-15%] h-80 w-[70%] rounded-full bg-zinc-500/[0.07] blur-[90px]"
          />

          <motion.article
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-labelledby={`badge-reveal-${item.definition.slug}`}
            aria-describedby={`badge-reveal-description-${item.definition.slug}`}
            className={`relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto border bg-[linear-gradient(145deg,rgba(31,31,35,0.98),rgba(7,7,8,0.98))] p-5 text-center shadow-2xl shadow-black/60 sm:p-8 ${tokens.borderClassName}`}
            initial={
              shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: 18 }
            }
            animate={
              shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion ? undefined : { opacity: 0, scale: 0.97, y: 12 }
            }
          >
            <PremiumBadgeEffects
              active={premium}
              rarity={item.definition.rarity}
              reducedMotion={shouldReduceMotion}
            />

            <motion.div
              className="relative z-10 mx-auto w-fit pt-2"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.72 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <BadgeArtwork item={item} variant="reveal" />
            </motion.div>

            <motion.div
              className="relative z-10"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.32, duration: 0.35 }}
            >
              <p className="mt-5 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                <Sparkles size={15} aria-hidden="true" />
                {premium
                  ? "Premium badge reveal"
                  : reason === "retroactive-premium"
                    ? "Badge reveal"
                    : "Badge unlocked"}
              </p>
              <h2
                id={`badge-reveal-${item.definition.slug}`}
                className="mt-3 text-3xl font-black text-white sm:text-4xl"
              >
                {item.definition.name}
              </h2>
              <p className={`mt-3 text-sm font-black uppercase tracking-[0.2em] ${tokens.textClassName}`}>
                {rarityLabel}
              </p>
              <p
                id={`badge-reveal-description-${item.definition.slug}`}
                className="mx-auto mt-4 max-w-md text-sm leading-6 text-zinc-300 sm:text-base"
              >
                {item.definition.unlockMeaning}
              </p>
            </motion.div>

            {queuePosition && queuePosition.total > 1 ? (
              <p className="relative z-10 mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                Badge {queuePosition.current} of {queuePosition.total}
              </p>
            ) : null}

            {errorMessage ? (
              <p
                role="alert"
                className="relative z-10 mt-5 border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                {errorMessage}
              </p>
            ) : null}

            {onContinue ? (
              <button
                ref={continueButtonRef}
                type="button"
                disabled={pending}
                onClick={onContinue}
                className="relative z-10 mt-6 min-h-12 w-full border border-orange-300 bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-300 disabled:cursor-wait disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                {pending ? "Saving reveal…" : continueLabel}
              </button>
            ) : null}

            {onClose ? (
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="relative z-10 mt-3 min-h-11 w-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-zinc-300 transition hover:border-orange-300/45 hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                Not now
              </button>
            ) : null}
          </motion.article>
        </div>
      ) : null}
    </AnimatePresence>,
    portalTarget
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

function restoreFocus(previouslyFocusedElement: HTMLElement | null) {
  if (
    previouslyFocusedElement &&
    previouslyFocusedElement !== document.body &&
    previouslyFocusedElement.isConnected &&
    !previouslyFocusedElement.inert
  ) {
    previouslyFocusedElement.focus();
    return;
  }

  document
    .querySelector<HTMLElement>(
      'main a[href], main button:not([disabled]), main [tabindex]:not([tabindex="-1"])'
    )
    ?.focus();
}
