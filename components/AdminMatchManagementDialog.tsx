"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import AdminMatchWorkspace from "@/components/AdminMatchWorkspace";
import type {
  GeneratedTournamentMatch,
  GeneratedTournamentBracket,
  TournamentCard,
  TournamentParticipant,
  MatchResultSubmission,
  MatchResultReportGroup,
} from "@/lib/tournaments";

export default function AdminMatchManagementDialog({
  tournament,
  match,
  bracketFormat,
  participantsById,
  viewer,
  submissions,
  reportGroups,
  readOnly = false,
  onClose,
  diceHistory,
}: {
  tournament: TournamentCard;
  match: GeneratedTournamentMatch;
  bracketFormat: GeneratedTournamentBracket["format"];
  participantsById: Map<string, TournamentParticipant>;
  viewer: { isAdmin: boolean };
  diceHistory?: ReactNode;
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
  readOnly?: boolean;
  onClose: () => void;
}) {
  const portalRoot = typeof document === "undefined" ? null : document.body;
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const eyebrowId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const [pendingActions, setPendingActions] = useState<Set<string>>(
    () => new Set()
  );
  const playerOne = match.playerOneRegistrationId
    ? participantsById.get(match.playerOneRegistrationId)
    : null;
  const playerTwo = match.playerTwoRegistrationId
    ? participantsById.get(match.playerTwoRegistrationId)
    : null;
  const activeReportGroup =
    reportGroups.find(
      (reportGroup) =>
        reportGroup.finalizedAt === null &&
        ["pending_confirmation", "disputed", "under_review"].includes(
          reportGroup.status
        )
    ) ?? null;
  const hasPendingSubmission = submissions.some(
    (submission) => submission.status === "pending"
  );
  const hasParticipants = Boolean(playerOne && playerTwo);
  const deadlineManaged = bracketFormat === "single_elimination";
  const canEnterOfficialResult =
    !readOnly &&
    hasParticipants &&
    (!deadlineManaged ||
      (match.status === "in_progress" &&
        !(match.holdStartedAt && !match.holdReleasedAt))) &&
    !activeReportGroup &&
    !hasPendingSubmission;

  const handlePendingChange = useCallback((key: string, isPending: boolean) => {
    setPendingActions((current) => {
      if (current.has(key) === isPending) return current;
      const next = new Set(current);
      if (isPending) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);
  const actionPending = pendingActions.size > 0;
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    const dialogPending =
      dialogRef.current?.getAttribute("aria-busy") === "true";
    const formPending = dialogRef.current?.querySelector('[aria-busy="true"]');
    if (!dialogPending && !formPending) onCloseRef.current();
  }, []);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  useEffect(() => {
    const handleDialogKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]'
        ) ?? []
      ).filter((element) => {
        if (element.tabIndex < 0 || element.closest("[hidden], [inert]"))
          return false;
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== dialogRef.current) {
          if (
            ancestor instanceof HTMLDetailsElement &&
            !ancestor.open &&
            !ancestor.querySelector("summary")?.contains(element)
          )
            return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const activeElement = document.activeElement;
      const focusIsOutsideSequence =
        !(activeElement instanceof HTMLElement) ||
        !focusable.includes(activeElement);

      if (
        event.shiftKey &&
        (activeElement === first || focusIsOutsideSequence)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || focusIsOutsideSequence)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [requestClose]);

  if (!portalRoot) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] grid place-items-center p-3 sm:p-6 [padding-top:max(0.75rem,env(safe-area-inset-top))] [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <motion.div
          aria-hidden="true"
          data-admin-match-dialog-backdrop
          onMouseDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
        />
        <motion.section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${eyebrowId} ${titleId}`}
          aria-describedby={descriptionId}
          aria-busy={actionPending}
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl min-w-0 flex-col overflow-hidden border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_32%),linear-gradient(145deg,rgba(12,12,12,0.98),rgba(0,0,0,0.99))] shadow-[0_0_90px_rgba(0,0,0,0.68)]"
        >
          <header className="relative shrink-0 border-b border-white/10 px-5 py-5 sm:px-7">
            <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.9)]" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p
                  id={eyebrowId}
                  className="text-xs font-black uppercase tracking-[0.28em] text-orange-300"
                >
                  {readOnly ? "Read-Only Match History" : "Manage Match"}
                </p>
                <h2
                  id={titleId}
                  className="mt-2 break-words text-sm font-bold text-zinc-300"
                >
                  {tournament.title}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm text-zinc-400">
                  {match.roundName} - Match {match.matchNumber}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={requestClose}
                disabled={actionPending}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-3 text-zinc-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-wait disabled:opacity-50"
                aria-label="Close match management"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div
            data-admin-match-scrollport
            className="min-h-0 w-full max-w-full min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7 [overflow-wrap:anywhere]"
          >
            <AdminMatchWorkspace
              match={match}
              participantsById={participantsById}
              reportGroups={reportGroups}
              submissions={submissions}
              readOnly={readOnly}
              isAdmin={!readOnly && viewer.isAdmin}
              deadlineManaged={deadlineManaged}
              canEnterOfficialResult={canEnterOfficialResult}
              onPendingChange={handlePendingChange}
              diceHistory={diceHistory}
            />
          </div>
        </motion.section>
      </div>
    </AnimatePresence>,
    portalRoot
  );
}
