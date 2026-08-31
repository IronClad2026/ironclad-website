"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  getLocalizedRarity,
  interpolateBadgeCopy,
  localizeBadgeItem,
  resolveBadgesDictionary,
} from "@/components/badges/badgeUi";
import { useBadgeModalDialog } from "@/components/badges/useBadgeModalDialog";
import {
  BADGE_RARITY_TOKENS,
} from "@/lib/badges/presentation";
import type {
  BadgePresentationEntitlement,
  EarnedBadgeCollectionItem,
} from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

type RevealPhase =
  | "intro"
  | "revealed"
  | "orbiting"
  | "transferring"
  | "saving"
  | "complete";

type RectSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TransferGeometry = {
  source: RectSnapshot;
  destination: RectSnapshot;
  hasDestination: boolean;
};

type OrbitGeometry = {
  source: RectSnapshot;
  end: RectSnapshot;
  left: number[];
  top: number[];
  compact: boolean;
};

export type BadgeRevealOverlayProps = {
  item: EarnedBadgeCollectionItem;
  open?: boolean;
  entitlement?: BadgePresentationEntitlement;
  reason?: "new-unlock" | "retroactive-premium";
  onClose?: () => void;
  onContinue?: () => boolean | void | Promise<boolean | void>;
  getDestinationRect?: () => DOMRect | null;
  onDestinationSettle?: () => void;
  continueLabel?: string;
  pending?: boolean;
  errorMessage?: string | null;
  queuePosition?: { current: number; total: number };
  reducedMotion?: boolean;
  dictionary?: BadgesDictionary;
};

export default function BadgeRevealOverlay({
  item,
  open = true,
  entitlement = defaultEntitlement,
  onClose,
  onContinue,
  getDestinationRect,
  onDestinationSettle,
  continueLabel,
  pending = false,
  errorMessage = null,
  queuePosition,
  reducedMotion,
  dictionary,
}: BadgeRevealOverlayProps) {
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const artworkAnchorRef = useRef<HTMLDivElement>(null);
  const completingTransferRef = useRef(false);
  const lockInAttemptRef = useRef(0);
  const [phase, setPhase] = useState<RevealPhase>("intro");
  const [orbitGeometry, setOrbitGeometry] = useState<OrbitGeometry | null>(
    null
  );
  const [transferGeometry, setTransferGeometry] =
    useState<TransferGeometry | null>(null);
  const copy = resolveBadgesDictionary(dictionary);
  const hydrationComplete = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  );
  const localizedItem = localizeBadgeItem(item, copy);
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? Boolean(prefersReducedMotion);
  const premium = entitlement.premiumEffectsEnabled;
  const tokens = BADGE_RARITY_TOKENS[localizedItem.definition.rarity];
  const rarityLabel = getLocalizedRarity(
    copy,
    localizedItem.definition.rarity
  );
  const resolvedContinueLabel = continueLabel ?? copy.reveal.continue;
  const portalTarget =
    hydrationComplete && typeof document !== "undefined"
      ? document.body
      : null;
  const motionInProgress = phase === "orbiting" || phase === "transferring";
  const accessibleBusy = motionInProgress || phase === "saving";
  const transferOrSavePending =
    accessibleBusy || pending;
  const { dialogRef, overlayRootRef } = useBadgeModalDialog({
    open,
    onDismiss: onClose,
    dismissDisabled: transferOrSavePending,
    initialFocusRef: dismissButtonRef,
  });

  useEffect(() => {
    completingTransferRef.current = false;

    const revealDelay = shouldReduceMotion ? 180 : 520;
    const timer = window.setTimeout(() => setPhase("revealed"), revealDelay);

    return () => window.clearTimeout(timer);
  }, [localizedItem.award.awardId, localizedItem.definition.slug, shouldReduceMotion]);

  useEffect(() => {
    if (phase !== "revealed" || !errorMessage) return;

    const focusTimer = window.setTimeout(
      () => continueButtonRef.current?.focus(),
      0
    );
    return () => window.clearTimeout(focusTimer);
  }, [errorMessage, phase]);

  useEffect(() => {
    if (!accessibleBusy) return;

    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [accessibleBusy, dialogRef, phase]);

  useEffect(
    () => () => {
      lockInAttemptRef.current += 1;
    },
    []
  );

  const completeTransfer = useCallback(async () => {
    if (completingTransferRef.current) return;

    completingTransferRef.current = true;
    setPhase("saving");

    try {
      const completed = await onContinue?.();

      if (completed === false) {
        completingTransferRef.current = false;
        setOrbitGeometry(null);
        setTransferGeometry(null);
        setPhase("revealed");
        return;
      }

      onDestinationSettle?.();
      setPhase("complete");
    } catch {
      completingTransferRef.current = false;
      setOrbitGeometry(null);
      setTransferGeometry(null);
      setPhase("revealed");
    }
  }, [onContinue, onDestinationSettle]);

  const beginLockIn = useCallback(() => {
    if (!orbitGeometry) return;

    const attempt = lockInAttemptRef.current + 1;
    lockInAttemptRef.current = attempt;
    const measuredDestination = getDestinationRect?.() ?? null;
    const destinationElement = findRevealDestination(
      localizedItem.definition.slug
    );
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const finishLockIn = (destination: DOMRect | null) => {
      if (lockInAttemptRef.current !== attempt) return;

      setTransferGeometry(
        buildTransferGeometry(orbitGeometry.end, destination)
      );
      setPhase("transferring");
    };

    if (
      measuredDestination &&
      destinationElement &&
      isOutsideViewport(measuredDestination, viewport)
    ) {
      try {
        destinationElement.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "auto",
        });
      } catch {
        finishLockIn(measuredDestination);
        return;
      }

      void waitForAnimationFrames(2).then(() => {
        finishLockIn(getDestinationRect?.() ?? null);
      });
      return;
    }

    finishLockIn(measuredDestination);
  }, [
    getDestinationRect,
    localizedItem.definition.slug,
    orbitGeometry,
  ]);

  const beginTransfer = () => {
    if (phase !== "revealed" || pending) return;

    const sourceRect = artworkAnchorRef.current?.getBoundingClientRect();
    if (!sourceRect) return;

    const source = snapshotRect(sourceRect);
    const preliminaryDestination = getDestinationRect?.() ?? null;

    if (shouldReduceMotion) {
      setTransferGeometry(
        buildTransferGeometry(source, preliminaryDestination)
      );
      setPhase("transferring");
      return;
    }

    setOrbitGeometry(
      buildOrbitGeometry(source, preliminaryDestination, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );
    setPhase("orbiting");
  };

  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          ref={overlayRootRef}
          className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6"
          data-motion={shouldReduceMotion ? "reduced" : "animated"}
          data-reveal-phase={phase}
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 h-full w-full cursor-default bg-black/82 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: phase === "complete" ? 0 : 1 }}
            exit={{ opacity: 0 }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-[-20%] top-[18%] h-72 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.13),rgba(24,24,27,0.08)_42%,transparent_72%)] blur-3xl"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-[-10%] left-[-15%] h-80 w-[70%] rounded-full bg-zinc-500/[0.07] blur-[90px]"
          />

          <AnimatePresence>
            {phase !== "complete" ? (
              <motion.article
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-busy={accessibleBusy || undefined}
                tabIndex={-1}
                aria-labelledby={`badge-reveal-${localizedItem.definition.slug}`}
                aria-describedby={`badge-reveal-description-${localizedItem.definition.slug}`}
                data-badge-reveal-progress={
                  accessibleBusy ? phase : undefined
                }
                className={`relative z-10 w-full max-w-xl text-center ${
                  motionInProgress
                    ? "pointer-events-none opacity-0"
                    : `max-h-[calc(100dvh-2rem)] overflow-y-auto border bg-[linear-gradient(145deg,rgba(31,31,35,0.98),rgba(7,7,8,0.98))] p-5 shadow-2xl shadow-black/60 sm:p-8 ${tokens.borderClassName}`
                }`}
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.96, y: 18 }
                }
                animate={
                  motionInProgress
                    ? { opacity: 0, scale: 0.98, y: 0 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.98,
                        y: 4,
                        transition: { duration: 0.12, ease: "easeOut" },
                      }
                }
              >
                <h2
                  id={`badge-reveal-${localizedItem.definition.slug}`}
                  className="sr-only"
                >
                  {localizedItem.definition.name}
                </h2>
                <p
                  id={`badge-reveal-description-${localizedItem.definition.slug}`}
                  className="sr-only"
                >
                  {localizedItem.definition.unlockMeaning}
                </p>

                {phase === "saving" ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="relative z-10 grid min-h-48 place-items-center"
                  >
                    <div>
                      <span
                        aria-hidden="true"
                        className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-zinc-600 border-t-orange-300"
                      />
                      <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-zinc-200">
                        {copy.reveal.saving}
                      </p>
                    </div>
                  </div>
                ) : motionInProgress ? (
                  <p role="status" aria-live="polite" className="sr-only">
                    {copy.reveal.unlocked}
                  </p>
                ) : (
                  <>
                <PremiumBadgeEffects
                  active={premium && phase === "revealed"}
                  rarity={localizedItem.definition.rarity}
                  reducedMotion={shouldReduceMotion}
                />

                <div className="relative z-10 mx-auto w-fit pt-2 [perspective:900px]">
                  <motion.div
                    ref={artworkAnchorRef}
                    data-testid="badge-reveal-artwork-anchor"
                    className="relative [transform-style:preserve-3d]"
                    initial={
                      shouldReduceMotion
                        ? { opacity: 0, scale: 0.94 }
                        : { opacity: 0, scale: 0.72, rotateY: 0 }
                    }
                    animate={
                      shouldReduceMotion
                        ? { opacity: 1, scale: 1 }
                        : phase === "intro"
                          ? {
                              opacity: [0, 1, 1],
                              scale: [0.82, 1.025, 1],
                              rotateY: [0, -18, 0],
                              rotateZ: [0, -0.8, 0],
                            }
                          : { opacity: 1, scale: 1, rotateY: 0, rotateZ: 0 }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0.18 : 0.52,
                      ease: [0.2, 0.75, 0.25, 1],
                    }}
                  >
                    <BadgeArtwork
                      item={localizedItem}
                      variant="reveal"
                      presentation="unrevealed"
                      dictionary={copy}
                    />
                    {!shouldReduceMotion && phase === "intro" ? (
                      <motion.span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-[6%] -left-1/3 z-30 w-1/4 skew-x-[-16deg] bg-gradient-to-r from-transparent via-zinc-100/45 to-transparent mix-blend-screen blur-[1px]"
                        initial={{ x: "0%", opacity: 0 }}
                        animate={{ x: "560%", opacity: [0, 0.8, 0] }}
                        transition={{
                          delay: 0.28,
                          duration: 0.48,
                          ease: "easeInOut",
                        }}
                      />
                    ) : null}
                  </motion.div>
                </div>

                <motion.div
                  className="relative z-10"
                  initial={false}
                  animate={{
                    opacity: phase === "revealed" ? 1 : 0,
                    y: phase === "revealed" ? 0 : 10,
                  }}
                  transition={{ duration: shouldReduceMotion ? 0.16 : 0.3 }}
                  aria-hidden={phase !== "revealed"}
                >
                  <p className="mt-5 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                    <Sparkles size={15} aria-hidden="true" />
                    {copy.reveal.unlocked}
                  </p>
                  <h2
                    className="mt-3 text-3xl font-black text-white sm:text-4xl"
                  >
                    {localizedItem.definition.name}
                  </h2>
                  <p
                    className={`mt-3 text-sm font-black uppercase tracking-[0.2em] ${tokens.textClassName}`}
                  >
                    {rarityLabel}
                  </p>
                  <p
                    className="mx-auto mt-4 max-w-md text-sm leading-6 text-zinc-300 sm:text-base"
                  >
                    {localizedItem.definition.unlockMeaning}
                  </p>
                </motion.div>

                {queuePosition && queuePosition.total > 1 ? (
                  <p className="relative z-10 mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                    {interpolateBadgeCopy(copy.reveal.queuePosition, {
                      current: queuePosition.current,
                      total: queuePosition.total,
                    })}
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
                    disabled={phase !== "revealed" || pending}
                    onClick={beginTransfer}
                    className="relative z-10 mt-6 min-h-12 w-full border border-orange-300 bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-300 disabled:cursor-wait disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                  >
                    {pending
                      ? copy.reveal.saving
                      : errorMessage
                        ? copy.reveal.retry
                        : resolvedContinueLabel}
                  </button>
                ) : null}

                {onClose ? (
                  <button
                    ref={dismissButtonRef}
                    type="button"
                    disabled={transferOrSavePending}
                    onClick={onClose}
                    className="relative z-10 mt-3 min-h-11 w-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-zinc-300 transition hover:border-orange-300/45 hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                  >
                    {copy.reveal.notNow}
                  </button>
                ) : null}
                  </>
                )}
              </motion.article>
            ) : null}
          </AnimatePresence>

          {phase === "orbiting" && orbitGeometry ? (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none fixed z-[10020] grid place-items-center [transform-style:preserve-3d]"
              data-badge-reveal-orbit={
                orbitGeometry.compact ? "compact" : "wide"
              }
              initial={{
                left: orbitGeometry.source.left,
                top: orbitGeometry.source.top,
                width: orbitGeometry.source.width,
                height: orbitGeometry.source.height,
                opacity: 0,
                scale: 1,
                rotateY: 0,
                rotateZ: 0,
                transformPerspective: 1000,
              }}
              animate={{
                left: orbitGeometry.left,
                top: orbitGeometry.top,
                opacity: 1,
                scale: orbitGeometry.compact
                  ? [1, 1.04, 1.06, 1.025, 0.98]
                  : [1, 1.08, 1.12, 1.04, 0.98],
                rotateY: [0, 260, 520, 760, 900],
                rotateZ: [0, -2.2, 2.7, -1.3, -0.4],
                transformPerspective: 1000,
              }}
              transition={{
                duration: 1.9,
                times: [0, 0.22, 0.5, 0.74, 1],
                ease: [0.2, 0.72, 0.2, 1],
                opacity: { duration: 0.12, ease: "easeOut" },
              }}
              onAnimationComplete={beginLockIn}
            >
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 0.96, 0.65, 0.12, 0] }}
                transition={{
                  duration: 1.9,
                  times: [0, 0.22, 0.5, 0.74, 1],
                  ease: "easeInOut",
                }}
              >
                <BadgeArtwork
                  item={localizedItem}
                  variant="slot"
                  presentation="unrevealed"
                  className="h-full w-full"
                  dictionary={copy}
                />
              </motion.div>
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.04, 0.42, 0.94, 1] }}
                transition={{
                  duration: 1.9,
                  times: [0, 0.22, 0.5, 0.74, 1],
                  ease: "easeInOut",
                }}
              >
                <BadgeArtwork
                  item={localizedItem}
                  variant="slot"
                  presentation="revealed"
                  className="h-full w-full"
                  dictionary={copy}
                />
              </motion.div>
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-[5%] -left-1/3 z-30 w-1/4 skew-x-[-16deg] bg-gradient-to-r from-transparent via-zinc-100/48 to-transparent mix-blend-screen blur-[1px]"
                initial={{ x: "0%", opacity: 0 }}
                animate={{ x: "560%", opacity: [0, 0.78, 0] }}
                transition={{
                  delay: 0.38,
                  duration: 1.1,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          ) : null}

          {(phase === "transferring" || phase === "saving") &&
          transferGeometry ? (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none fixed z-[10020] grid place-items-center"
              data-badge-transfer={
                transferGeometry.hasDestination ? "measured" : "fallback"
              }
              data-transfer-motion={shouldReduceMotion ? "fade" : "flight"}
              data-transfer-state={phase}
              initial={{
                left: transferGeometry.source.left,
                top: transferGeometry.source.top,
                width: transferGeometry.source.width,
                height: transferGeometry.source.height,
                opacity: 1,
                scale: shouldReduceMotion ? 1 : 0.98,
                rotateY: shouldReduceMotion ? 0 : 900,
                rotateZ: shouldReduceMotion ? 0 : -0.4,
                transformPerspective: 1000,
              }}
              animate={{
                left: shouldReduceMotion
                  ? transferGeometry.source.left
                  : transferGeometry.destination.left,
                top: shouldReduceMotion
                  ? transferGeometry.source.top
                  : transferGeometry.destination.top,
                width: shouldReduceMotion
                  ? transferGeometry.source.width
                  : transferGeometry.destination.width,
                height: shouldReduceMotion
                  ? transferGeometry.source.height
                  : transferGeometry.destination.height,
                opacity: shouldReduceMotion ? [1, 0.35, 0] : 1,
                scale: shouldReduceMotion
                  ? [1, 0.96]
                  : [0.98, 1.035, 0.995, 1],
                rotateY: shouldReduceMotion
                  ? 0
                  : [900, 990, 1050, 1080],
                rotateZ: shouldReduceMotion ? 0 : [-0.4, 0.7, -0.2, 0],
                transformPerspective: 1000,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.2 : 0.72,
                ease: [0.16, 0.8, 0.2, 1],
              }}
              onAnimationComplete={
                phase === "transferring" ? completeTransfer : undefined
              }
            >
              <BadgeArtwork
                item={localizedItem}
                variant="slot"
                presentation="revealed"
                className="h-full w-full"
                dictionary={copy}
              />
            </motion.div>
          ) : null}
        </div>
      ) : null}
    </AnimatePresence>,
    portalTarget
  );
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function buildTransferGeometry(
  source: RectSnapshot,
  measuredDestination: DOMRect | null
): TransferGeometry {
  const fallbackDestination = {
    left: source.left + source.width * 0.35,
    top: source.top + source.height * 0.35,
    width: source.width * 0.3,
    height: source.height * 0.3,
  };

  return {
    source,
    destination: measuredDestination
      ? snapshotRect(measuredDestination)
      : fallbackDestination,
    hasDestination: Boolean(measuredDestination),
  };
}

function buildOrbitGeometry(
  source: RectSnapshot,
  preliminaryDestination: DOMRect | null,
  viewport: { width: number; height: number }
): OrbitGeometry {
  const compact = viewport.width < 640 || viewport.height < 680;
  const scalePeak = compact ? 1.06 : 1.12;
  const scaledInset =
    (Math.max(source.width, source.height) * (scalePeak - 1)) / 2;
  const margin = (compact ? 12 : 24) + scaledInset;
  const minLeft = margin;
  const minTop = margin;
  const maxLeft = Math.max(minLeft, viewport.width - source.width - margin);
  const maxTop = Math.max(minTop, viewport.height - source.height - margin);
  const normalizedSource = {
    ...source,
    left: clamp(source.left, minLeft, maxLeft),
    top: clamp(source.top, minTop, maxTop),
  };
  const xReach = compact
    ? Math.min(viewport.width * 0.11, 44)
    : Math.min(viewport.width * 0.16, 200);
  const yReach = compact
    ? Math.min(viewport.height * 0.08, 56)
    : Math.min(viewport.height * 0.13, 120);
  const endXOffset = preliminaryDestination
    ? clamp(
        (preliminaryDestination.left - normalizedSource.left) * 0.08,
        -xReach * 0.24,
        xReach * 0.24
      )
    : 0;
  const endYOffset = preliminaryDestination
    ? clamp(
        (preliminaryDestination.top - normalizedSource.top) * 0.08,
        -yReach * 0.2,
        yReach * 0.2
      )
    : 0;
  const point = (left: number, top: number) => ({
    left: clamp(left, minLeft, maxLeft),
    top: clamp(top, minTop, maxTop),
  });
  const upperRight = point(
    normalizedSource.left + xReach,
    normalizedSource.top - yReach * 0.78
  );
  const upperLeft = point(
    normalizedSource.left - xReach * 0.92,
    normalizedSource.top - yReach * 0.28
  );
  const lowerRight = point(
    normalizedSource.left + xReach * 0.72,
    normalizedSource.top + yReach * 0.72
  );
  const end = point(
    normalizedSource.left + endXOffset,
    normalizedSource.top + endYOffset
  );

  return {
    source: normalizedSource,
    end: { ...normalizedSource, ...end },
    left: [
      normalizedSource.left,
      upperRight.left,
      upperLeft.left,
      lowerRight.left,
      end.left,
    ],
    top: [
      normalizedSource.top,
      upperRight.top,
      upperLeft.top,
      lowerRight.top,
      end.top,
    ],
    compact,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function findRevealDestination(slug: string) {
  if (typeof document === "undefined") return null;

  return (
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-badge-reveal-destination="true"]'
      )
    ).find(
      (element) =>
        element.isConnected &&
        element.closest<HTMLElement>("[data-badge-slug]")?.dataset
          .badgeSlug === slug
    ) ?? null
  );
}

function isOutsideViewport(
  rect: DOMRect,
  viewport: { width: number; height: number }
) {
  return (
    rect.left < 0 ||
    rect.top < 0 ||
    rect.right > viewport.width ||
    rect.bottom > viewport.height
  );
}

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    const wait = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      window.requestAnimationFrame(() => wait(remaining - 1));
    };

    wait(count);
  });
}
