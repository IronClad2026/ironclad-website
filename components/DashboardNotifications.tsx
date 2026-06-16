"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  Clock3,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmDashboardMatchResult,
  dismissDashboardNotifications,
  disputeDashboardMatchResult,
} from "@/app/dashboard/actions";
import type { DashboardNotification } from "@/lib/player-dashboard";

export default function DashboardNotifications({
  notifications: initialNotifications,
}: {
  notifications: DashboardNotification[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<DashboardNotification | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const actionRequired = notifications.filter(
    (notification) =>
      notification.canConfirm ||
      notification.canDispute ||
      notification.status === "rejected" ||
      notification.status === "resubmission_requested"
  ).length;
  const allSelected =
    notifications.length > 0 && selectedIds.size === notifications.length;

  useEffect(() => {
    if (!selected) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  useEffect(() => {
    if (
      notifications.every(
        (notification) => notification.confirmationDeadlineAt === null
      )
    ) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [notifications]);

  const deleteNotifications = (
    notificationIds: string[],
    deleteAll = false
  ) => {
    if ((!deleteAll && notificationIds.length === 0) || pending) return;

    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      for (const notificationId of notificationIds) {
        formData.append("notificationId", notificationId);
      }
      if (deleteAll) formData.set("deleteAll", "true");

      const result = await dismissDashboardNotifications(formData);
      setMessage(result.message);

      if (result.status === "error") return;

      const dismissed = new Set(result.dismissedIds);
      setNotifications((current) =>
        current.filter((notification) => !dismissed.has(notification.id))
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const dismissedId of dismissed) next.delete(dismissedId);
        return next;
      });
      if (selected && dismissed.has(selected.id)) setSelected(null);
      router.refresh();
    });
  };

  const respondToReportGroup = (
    notification: DashboardNotification,
    decision: "confirm" | "dispute",
    disputeNotes = ""
  ) => {
    if (!notification.reportGroupId || pending) return;

    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("reportGroupId", notification.reportGroupId ?? "");
      if (decision === "dispute") {
        formData.set("disputeNotes", disputeNotes);
      }

      const result =
        decision === "confirm"
          ? await confirmDashboardMatchResult(formData)
          : await disputeDashboardMatchResult(formData);
      setMessage(result.message);

      if (result.status === "success") {
        setSelected(null);
        router.refresh();
      }
    });
  };

  const toggleSelected = (notificationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  };

  return (
    <section className="relative mt-8 max-w-xl">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-orange-500/25 bg-[linear-gradient(135deg,rgba(249,115,22,0.09),rgba(255,255,255,0.03))] p-5 text-left shadow-xl shadow-black/20 transition hover:border-orange-400/45"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <Bell size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black uppercase tracking-[0.18em] text-white">
              Notifications
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-400">
              {notifications.length === 0
                ? "No match messages"
                : `${notifications.length} match ${
                    notifications.length === 1 ? "message" : "messages"
                  }`}
              {actionRequired > 0
                ? ` - ${actionRequired} require action`
                : ""}
            </span>
          </span>
        </span>
        <ChevronDown
          size={19}
          className={`shrink-0 text-zinc-400 transition ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="relative z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {notifications.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">
                Match submissions and administrator decisions will appear here.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        allSelected
                          ? new Set()
                          : new Set(
                              notifications.map(
                                (notification) => notification.id
                              )
                            )
                      )
                    }
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/30 hover:text-white disabled:opacity-50"
                  >
                    <CheckSquare2 size={14} />
                    {allSelected ? "Clear Selection" : "Select All"}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        deleteNotifications([...selectedIds])
                      }
                      disabled={pending || selectedIds.size === 0}
                      className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-200 transition hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Delete Selected
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deleteNotifications([], true)
                      }
                      disabled={pending}
                      className="rounded-lg bg-red-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      Delete All
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {notifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      checked={selectedIds.has(notification.id)}
                      now={now}
                      pending={pending}
                      onToggle={() => toggleSelected(notification.id)}
                      onOpen={() => setSelected(notification)}
                      onDelete={() =>
                        deleteNotifications([notification.id])
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {message && (
              <p
                aria-live="polite"
                className="border-t border-white/10 px-4 py-3 text-xs text-zinc-400"
              >
                {pending ? "Updating notifications..." : message}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <NotificationModal
            notification={selected}
            now={now}
            pending={pending}
            onRespond={respondToReportGroup}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function NotificationRow({
  notification,
  checked,
  now,
  pending,
  onToggle,
  onOpen,
  onDelete,
}: {
  notification: DashboardNotification;
  checked: boolean;
  now: number;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const content = notificationContent(notification);
  const Icon = content.icon;

  return (
    <div className="flex items-start gap-2 rounded-xl px-2 py-2 transition hover:bg-white/5">
      <label className="mt-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={pending}
          aria-label={`Select notification ${notificationLabel(notification)}`}
          className="h-4 w-4 accent-orange-500"
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-1 py-1 text-left"
      >
        <span className={`mt-0.5 shrink-0 ${content.iconClassName}`}>
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white">
            {content.title}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-500">
            {notification.tournamentName} - {notificationLabel(notification)}
          </span>
          {notification.confirmationDeadlineAt &&
            notification.status === "pending_confirmation" && (
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-orange-300">
                {formatTimeRemaining(notification.confirmationDeadlineAt, now)}
              </span>
            )}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600">
          {formatCompactDate(
            notification.reviewedAt ?? notification.submittedAt
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label={`Delete notification ${notificationLabel(notification)}`}
        className="mt-0.5 shrink-0 rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function NotificationModal({
  notification,
  now,
  pending,
  onRespond,
  onClose,
}: {
  notification: DashboardNotification;
  now: number;
  pending: boolean;
  onRespond: (
    notification: DashboardNotification,
    decision: "confirm" | "dispute",
    disputeNotes?: string
  ) => void;
  onClose: () => void;
}) {
  const [disputeNotes, setDisputeNotes] = useState("");
  const content = notificationContent(notification);
  const Icon = content.icon;
  const responseAvailable =
    notification.canConfirm &&
    notification.confirmationDeadlineAt !== null &&
    now < new Date(notification.confirmationDeadlineAt).getTime();
  const showConfirmationSummary =
    notification.source === "report_group" &&
    notification.status === "pending_confirmation";

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <motion.button
        type="button"
        aria-label="Close notification"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
      />
      <motion.article
        role="dialog"
        aria-modal="true"
        aria-labelledby={`notification-${notification.sourceId}`}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative max-h-[88vh] w-[min(92vw,30rem)] overflow-y-auto rounded-2xl border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_35%),linear-gradient(145deg,#111827,#030712)] shadow-[0_0_60px_rgba(249,115,22,0.14)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 ${content.iconClassName}`}
            >
              <Icon size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                Match Notification
              </p>
              <h2
                id={`notification-${notification.sourceId}`}
                className="mt-1.5 break-words text-lg font-black text-white sm:text-xl"
              >
                {content.title}
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-zinc-400">
                {content.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification"
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-orange-400/40 hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        {showConfirmationSummary && (
          <div className="space-y-3 border-b border-white/10 p-4 sm:p-5">
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <CompactDetail
                label="Opponent"
                value={notification.opponentName}
              />
              <CompactDetail
                label="Score"
                value={notification.reportedScore}
              />
              <CompactDetail
                label="Time"
                value={
                  notification.confirmationDeadlineAt
                    ? formatTimeRemaining(
                        notification.confirmationDeadlineAt,
                        now
                      )
                    : "Unavailable"
                }
              />
            </div>

            {responseAvailable && (
              <div className="space-y-3 rounded-xl border border-orange-400/20 bg-orange-500/5 p-3">
                <textarea
                  value={disputeNotes}
                  onChange={(event) => setDisputeNotes(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Optional dispute notes"
                  className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRespond(notification, "confirm")}
                    className="rounded-lg bg-emerald-600 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Confirm Result
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      onRespond(notification, "dispute", disputeNotes)
                    }
                    className="rounded-lg bg-red-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
                  >
                    Dispute Result
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
          <Detail label="Tournament" value={notification.tournamentName} />
          <Detail
            label="Match"
            value={`${notification.roundName} - Match ${notification.matchNumber}`}
          />
          <Detail label="Submission" value={notificationLabel(notification)} />
          <Detail label="Opponent" value={notification.opponentName} />
          <Detail label="Reported Winner" value={notification.reportedWinner} />
          <Detail label="Reported Loser" value={notification.reportedLoser} />
          <Detail label="Reported Score" value={notification.reportedScore} />
          <Detail label="Status" value={formatStatus(notification.status)} />
          {notification.confirmationDeadlineAt && (
            <Detail
              label="Time Remaining"
              value={formatTimeRemaining(notification.confirmationDeadlineAt, now)}
            />
          )}
          <Detail
            label={notification.reviewedAt ? "Reviewed" : "Submitted"}
            value={formatDate(
              notification.reviewedAt ?? notification.submittedAt
            )}
          />
        </div>

        {notification.reviewNotes && (
          <div className="mx-6 mb-6 rounded-2xl border border-orange-400/20 bg-orange-500/5 p-5 sm:mx-8 sm:mb-8">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-200">
              <MessageSquareText size={15} />
              Administrator Message
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {notification.reviewNotes}
            </p>
          </div>
        )}

        {notification.source === "report_group" &&
          notification.status === "pending_confirmation" &&
          !responseAvailable &&
          !notification.submittedByViewer && (
            <div className="mx-4 mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80 sm:mx-5 sm:mb-5">
              The confirmation window has expired. Automatic approval is
              waiting for the scheduled job to process this result.
            </div>
          )}
      </motion.article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-bold text-white">{value}</p>
    </div>
  );
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-2.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-white">{value}</p>
    </div>
  );
}

function notificationContent(notification: DashboardNotification) {
  if (notification.status === "pending_confirmation") {
    if (notification.submittedByViewer) {
      return {
        title: `Submission #${notification.submissionNumber} awaiting confirmation`,
        message:
          "Your match result was submitted successfully. Your opponent must confirm or dispute before the deadline.",
        icon: Clock3,
        iconClassName: "text-sky-300",
      };
    }

    return {
      title: "Match Result Confirmation Required",
      message: `Your opponent has submitted the result for your match in ${notification.tournamentName}. Please confirm or dispute this result before the confirmation window expires.`,
      icon: Bell,
      iconClassName: "text-orange-300",
    };
  }
  if (notification.status === "approved") {
    return {
      title: "Match result approved",
      message: "The official result has been approved and recorded.",
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "confirmed") {
    return {
      title: "Match result confirmed",
      message: "The result was confirmed by the opponent and recorded.",
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "auto_approved") {
    return {
      title: "Match result auto-approved",
      message:
        "The confirmation window expired without a dispute, so the result was automatically approved.",
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "rejected") {
    return {
      title: "Match result rejected",
      message:
        "Review the administrator message before submitting corrected evidence.",
      icon: XCircle,
      iconClassName: "text-red-300",
    };
  }
  if (notification.status === "disputed") {
    return {
      title: "Match result disputed",
      message:
        "This result has been disputed and now requires administrator review.",
      icon: ShieldAlert,
      iconClassName: "text-red-300",
    };
  }
  if (notification.status === "under_review") {
    return {
      title: "Match result under review",
      message: "An administrator is reviewing this disputed result.",
      icon: Clock3,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.status === "resubmission_requested") {
    return {
      title: "Result resubmission requested",
      message:
        "The administrator requires a corrected result or additional proof.",
      icon: RotateCcw,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.status === "reset") {
    return {
      title: "Match result reset",
      message: "The result report was reset and the match remains unresolved.",
      icon: RotateCcw,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.submittedByViewer) {
    return {
      title: `Submission #${notification.submissionNumber} is under review`,
      message: "Your match result was submitted successfully.",
      icon: Clock3,
      iconClassName: "text-sky-300",
    };
  }

  return {
    title: "Your opponent submitted a match result",
    message:
      "The reported result is now under administrator review. Open this message to inspect the report.",
    icon: Bell,
    iconClassName: "text-orange-300",
  };
}

function notificationLabel(notification: DashboardNotification) {
  return notification.submissionNumber > 0
    ? `Submission #${notification.submissionNumber}`
    : "Result Confirmation";
}

function formatStatus(status: DashboardNotification["status"]) {
  return {
    pending: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    resubmission_requested: "Resubmission Requested",
    pending_confirmation: "Pending Opponent Confirmation",
    confirmed: "Confirmed",
    auto_approved: "Auto-Approved",
    disputed: "Disputed",
    under_review: "Under Review",
    reset: "Reset",
  }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTimeRemaining(value: string, now = Date.now()) {
  const remainingMs = new Date(value).getTime() - now;

  if (!Number.isFinite(remainingMs)) {
    return "Time remaining unavailable";
  }

  if (remainingMs <= 0) {
    return "Expired - awaiting automation";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s remaining`;
  }

  return `${seconds}s remaining`;
}
