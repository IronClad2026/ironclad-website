"use client";

import { useEffect, useRef, type RefObject } from "react";

type UseBadgeModalDialogOptions = {
  open: boolean;
  onDismiss?: () => void;
  dismissDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function useBadgeModalDialog({
  open,
  onDismiss,
  dismissDisabled = false,
  initialFocusRef,
}: UseBadgeModalDialogOptions) {
  const dialogRef = useRef<HTMLElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  const dismissDisabledRef = useRef(dismissDisabled);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    dismissDisabledRef.current = dismissDisabled;
  }, [dismissDisabled]);

  useEffect(() => {
    if (!open) return;

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
        !dismissDisabledRef.current &&
        onDismissRef.current
      ) {
        event.preventDefault();
        onDismissRef.current();
        return;
      }

      if (event.key !== "Tab") return;

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

    const focusInitialTarget = () => {
      const initialFocusTarget =
        initialFocusRef?.current ??
        getFocusableElements(dialogRef.current)[0] ??
        dialogRef.current;
      initialFocusTarget?.focus();
    };
    const focusFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(focusInitialTarget)
        : window.setTimeout(focusInitialTarget, 0);

    return () => {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(focusFrame);
      } else {
        window.clearTimeout(focusFrame);
      }
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
  }, [initialFocusRef, open]);

  return { dialogRef, overlayRootRef };
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
