"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ReferenceDialogProps = {
  title: string;
  context?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  size?: "wide" | "compact";
};

/** Native modal semantics keep reference content inert to the page behind it. */
export default function ReferenceDialog({
  title, context, closeLabel, onClose, children, size = "wide",
}: ReferenceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, summary, [tabindex]'
        )).filter((element) =>
          element.tabIndex >= 0 && !element.matches(":disabled") &&
          element.getClientRects().length > 0
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !controls.includes(active as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={`fixed inset-0 m-0 h-dvh max-h-dvh w-screen max-w-none border-0 bg-zinc-950 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/80 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:w-[calc(100vw-3rem)] sm:border sm:border-white/15 ${size === "compact" ? "sm:max-w-[760px]" : "sm:max-w-[1040px]"}`}
    >
      <div className="flex h-full max-h-dvh min-h-0 flex-col sm:h-auto sm:max-h-[85dvh]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            {context ? <p className="mb-1 break-words text-xs font-semibold text-orange-300">{context}</p> : null}
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="break-words text-xl font-bold outline-none sm:text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="grid h-11 w-11 shrink-0 place-items-center border border-white/15 text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
